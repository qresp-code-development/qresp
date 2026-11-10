"""A signed statement of what a reader was actually shown.

Rating "these recommendations" only means something if the server knows what
"these" were. The feedback endpoint used to take the reader's word for it: the
record id, how many results were on screen, which page they were on. All of it
was a request body, so all of it was assertable by anyone -- including a
record that does not exist, or a list that was empty.

So `GET /api/paper/{id}/related` now mints a short-lived token AFTER it has
resolved a public, active record and actually computed the external list, and
`POST .../related/feedback` will not store anything without one. The token is
the server's own note to itself, handed to the client and handed back.

WHAT IS BOUND
-------------
The cache key (record + source server, normalized), the list (`external`), the
real number of results, the real number of pages, and issue/expiry times --
under a purpose and a version, so a signature from some other feature can
never be replayed here.

WHAT IS NOT IN IT
-----------------
No recommended title, no DOI, no gate score, no gate reason, no user id, no
email, no session. The token says what the LIST was, never who was looking at
it, which is why it can travel in a public, cacheable response without
personalising it.

WHY HMAC AND NOT A DATABASE ROW
-------------------------------
Verification has to be local. A feedback POST must not reach the provider, the
peer, or even the recommendation cache -- the whole point is that rating
something is cheap. A signature is checkable with the secret and nothing else.
"""
import base64
import hashlib
import hmac
import json
import time

from flask import current_app

# Bump when the payload's meaning changes. Part of the signed material, so an
# old token cannot be reinterpreted under new rules.
VERSION = 1
# What this signature is FOR. Included in the signed payload so a token minted
# by some future feature under the same secret cannot be spent here.
PURPOSE = "related-feedback"

# Long enough that a reader can work through five pages, read a few abstracts
# and then rate; short enough that a token is not a durable capability. An
# expired token is a 410 and the page simply refetches.
TTL_SECONDS = 3600

# Bounds on what a token may claim, so a corrupted or hand-built payload
# cannot describe a list that could not exist.
MAX_RESULTS = 25
MAX_PAGES = 5


class ContextError(Exception):
    """The token is missing, expired, malformed, or for something else."""

    def __init__(self, reason, status=400):
        super(ContextError, self).__init__(reason)
        self.reason = reason
        self.status = status


class ConfigurationError(Exception):
    """This deployment has no signing secret.

    Raised rather than falling back to a constant. A hardcoded fallback key is
    a published key: anybody reading the source could mint tokens, and the
    signature would prove nothing while still looking like it did. Failing
    closed costs a feature; failing open costs the guarantee.
    """


def _secret():
    secret = getattr(current_app, "secret_key", None)
    if isinstance(secret, str):
        secret = secret.encode("utf-8")
    if not secret:
        raise ConfigurationError(
            "no Flask secret key is configured; feedback context tokens "
            "cannot be signed")
    return secret


def _b64(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text):
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def _sign(payload):
    return hmac.new(_secret(), payload, hashlib.sha256).digest()


def issue(cache_key, source, results, pages, now=None):
    """A token for a list that EXISTS. Returns "" when it does not.

    An empty list gets no token, so "there is nothing here" cannot be rated.
    The caller has already confirmed the record is public and active; this
    only records what was computed for it.
    """
    results = int(results or 0)
    if not cache_key or results <= 0:
        return ""
    now = int(now if now is not None else time.time())
    payload = {
        "v": VERSION,
        "p": PURPOSE,
        "k": str(cache_key),
        "s": str(source),
        # The REAL counts. `results_shown` is stored from here, never from the
        # request body, and the page fields are bounded by `n`.
        "r": min(results, MAX_RESULTS),
        "n": max(1, min(int(pages or 1), MAX_PAGES)),
        "iat": now,
        "exp": now + TTL_SECONDS,
    }
    encoded = json.dumps(payload, sort_keys=True,
                         separators=(",", ":")).encode("utf-8")
    body = _b64(encoded)
    return "%s.%s" % (body, _b64(_sign(body.encode("ascii"))))


def verify(token, cache_key, source, now=None):
    """The payload this token attests, or raise `ContextError`.

    Order matters: the SIGNATURE is checked before anything in the payload is
    believed, so nothing downstream ever reads an unverified number.
    """
    if not token or not isinstance(token, str):
        raise ContextError("a feedback context token is required", 400)
    parts = token.split(".")
    if len(parts) != 2 or not all(parts):
        raise ContextError("the feedback context token is malformed", 400)
    body, signature = parts
    # The secret is fetched OUTSIDE the catch-all below. A deployment with no
    # signing key is a server problem (503), and swallowing it into "your
    # token is malformed" would blame the client for a misconfiguration and
    # hide the one condition an operator has to fix.
    secret_is_present = _secret()
    del secret_is_present
    try:
        expected = _sign(body.encode("ascii"))
        provided = _unb64(signature)
    except Exception:
        raise ContextError("the feedback context token is malformed", 400)
    # Constant time: a comparison that returns early leaks how much of a
    # forged signature was right.
    if not hmac.compare_digest(expected, provided):
        raise ContextError("the feedback context token is not valid", 400)

    try:
        payload = json.loads(_unb64(body).decode("utf-8"))
    except Exception:
        raise ContextError("the feedback context token is malformed", 400)
    if not isinstance(payload, dict):
        raise ContextError("the feedback context token is malformed", 400)
    if payload.get("v") != VERSION or payload.get("p") != PURPOSE:
        raise ContextError("the feedback context token is not for this", 400)

    now = int(now if now is not None else time.time())
    try:
        expires = int(payload.get("exp") or 0)
    except (TypeError, ValueError):
        raise ContextError("the feedback context token is malformed", 400)
    if expires <= now:
        # 410, not 400: the client did nothing wrong and should simply reload
        # the recommendations to get a fresh one.
        raise ContextError("the feedback context has expired", 410)

    # Bound to THIS record and THIS list. A token for another paper, another
    # server, or the internal list is a token for a different question.
    if payload.get("k") != str(cache_key):
        raise ContextError("this feedback context is for another record", 400)
    if payload.get("s") != str(source):
        raise ContextError("this feedback context is for another list", 400)

    try:
        results = int(payload.get("r") or 0)
        pages = int(payload.get("n") or 0)
    except (TypeError, ValueError):
        raise ContextError("the feedback context token is malformed", 400)
    # A signed zero should be impossible -- `issue` refuses to mint one -- so
    # reaching here means the payload is not one this server produced.
    if results <= 0 or results > MAX_RESULTS:
        raise ContextError("the feedback context describes no results", 400)
    if pages <= 0 or pages > MAX_PAGES:
        raise ContextError("the feedback context is malformed", 400)
    return {"cache_key": payload["k"], "source": payload["s"],
            "results": results, "pages": pages,
            "issued_at": payload.get("iat"), "expires_at": expires}
