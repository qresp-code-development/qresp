"""Was the Related Research list any good? -- the reader's own answer.

Three endpoints (wired through swagger.yml):

- POST /api/paper/{id}/related/feedback   store or update MY rating
- GET  /api/paper/{id}/related/feedback   read back MY rating
- GET  /api/related/feedback/summary      counts, for an operator

SIGNED IN ONLY
--------------
This is a deliberate product decision, and a reversal of how it first
shipped. Anonymous rating was keyed by a per-session token, which meant a
respondent could mint a new identity by clearing a cookie -- so "one opinion
per reader" was not true, and an average built on it could be moved by one
person with a browser. There is no way to key an anonymous reader durably
without collecting something (an address, a fingerprint) that this feature has
no business collecting.

So a rating now requires an account, and ratings from readers without one are
not collected at all. That measures fewer people; it measures them honestly.

WHAT A RATING IS ABOUT
----------------------
Not what the client says it is. `GET /api/paper/{id}/related` mints a signed
`external.feedback_context` AFTER it has resolved a public, active record and
computed a non-empty external list, and nothing is stored without one. The
token carries the real result count and page count, so the numbers filed
against a rating are the server's, not the body's. See `feedback_context`.

WHAT IS STORED, AND WHAT DELIBERATELY IS NOT
--------------------------------------------
Stored: the rating, optional reason codes from a fixed list, an optional short
comment, which record and which list, and the counts the TOKEN attests.

NOT stored, and not read at any point on this path: the IP address, the
`User-Agent`, any other request header, the reader's email or account id in
readable form, the recommendation scores or "Why related" reasons, the titles
or DOIs of the recommended papers. No third party is contacted, by this
endpoint or by anything it calls.

`respondent` is an HMAC over the durable account identifier under the
deployment's Flask secret. It cannot be reversed to an account, it is never
returned by any endpoint, and its only job is to make a second submission an
UPDATE. If the deployment has no secret, nothing is stored: a hardcoded
fallback key is a published key, and a signature under it would prove nothing
while still looking like it did.
"""
import hashlib
import hmac
from datetime import datetime

from flask import current_app

from project import feedback_context
from project.auth import csrf_protect, get_current_user, is_admin
from project.models import RecommendationFeedback

# The lists a reader can be asked about. Only `external` is rated today (it is
# the only one that issues a context token), but the field exists so a rating
# of one list can never be averaged into the other.
SOURCES = ("external", "internal")

# Offered only for a 1 or a 2, and optional even then. A CLOSED set: a reason
# arriving from anywhere else is refused rather than stored, so the tally can
# never acquire a category nobody designed.
REASONS = (
    "too_many_unrelated",
    "not_my_research_area",
    "already_knew_these",
    "need_more_variety",
    "other",
)

MIN_RATING = 1
MAX_RATING = 5
# A sentence or two of context, not an essay. Bounded here AND on the model,
# because a document-level limit the handler does not enforce turns a long
# comment into a 500 instead of a 400.
MAX_COMMENT_CHARS = 1000
MAX_REASONS = len(REASONS)

# How a respondent was identified. Only 'account' is written now. Rows from
# the anonymous era have no value, which is exactly how the summary leaves
# them out without anything having to be deleted or migrated.
RESPONDENT_ACCOUNT = "account"


class ConfigurationError(Exception):
    """No signing secret. Nothing may be stored under a guessable key."""


def _account_identity(user):
    """The durable thing a reader is counted as, or None.

    `account_id` first: it is the row recorded from the identity provider's
    immutable issuer+subject pair, so it survives an email change at the
    institution. The normalized email is the fallback for a session that
    predates that record (dev login, or a provider that failed to write one).
    """
    if not user:
        return None
    account_id = str(user.get("account_id") or "").strip()
    if account_id:
        return "account:%s" % account_id
    email = str(user.get("email") or "").strip().lower()
    return "email:%s" % email if email else None


def respondent_key(user):
    """The stable, non-reversible key one reader is counted under.

    HMAC, not a bare SHA-256. A plain hash of an email is reversible by anyone
    holding a list of candidate addresses -- which, for a research group, is a
    published staff page. Keyed under the deployment's secret, the digest is
    meaningless without it.
    """
    identity = _account_identity(user)
    if not identity:
        return None
    secret = getattr(current_app, "secret_key", None)
    if isinstance(secret, str):
        secret = secret.encode("utf-8")
    if not secret:
        raise ConfigurationError(
            "no Flask secret key is configured; feedback cannot be keyed")
    return hmac.new(secret, identity.encode("utf-8"),
                    hashlib.sha256).hexdigest()


def _clean_reasons(raw):
    """The submitted reasons, allowlisted and de-duplicated.

    Returns (reasons, rejected). An unrecognised code is REFUSED, not dropped
    silently: a client sending one has a bug, and quietly storing four of five
    reasons would make the tally wrong in a way nobody could see.
    """
    if raw is None:
        return [], []
    if not isinstance(raw, (list, tuple)):
        return [], ["reasons must be a list"]
    reasons, rejected = [], []
    for item in raw[:MAX_REASONS + 1]:
        code = str(item or "").strip()
        if code not in REASONS:
            rejected.append(code)
        elif code not in reasons:
            reasons.append(code)
    return reasons, rejected


def _page_number(value, ceiling, default=1):
    """A page within the range the TOKEN says exists, or the default.

    Out-of-range is clamped rather than refused: the number is context for a
    rating, and losing the rating over it would be the wrong trade. What it
    can never be is a number the list does not have.
    """
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(1, min(number, ceiling))


def _resolve_target(id, server):
    """(cache_key, error). The record this rating is about, namespaced by
    server exactly as the recommendation cache is."""
    from project import federation

    kind, origin = federation.resolve_server(server, None)
    if kind == federation.REFUSED:
        return None, ({"error": "This Qresp server is not available."}, 400)
    return federation.cache_key(origin, id), None


@csrf_protect
def submit_feedback(id, body, server=None):
    """
    Record one reader's rating of the Related Research list for a record
    Handler for POST: /api/paper/{id}/related/feedback

    Signed in only, and only about a list the server itself said exists.

    Writes exactly one document per (account, record, list) and UPDATES it on
    a second submission, so changing one's mind corrects a rating instead of
    casting a second vote.
    """
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401

    body = body or {}

    rating = body.get("rating")
    # `True` is an int in Python and would otherwise store as 1. A boolean is
    # not a rating.
    if isinstance(rating, bool) or not isinstance(rating, int):
        try:
            rating = int(str(rating).strip())
        except (TypeError, ValueError):
            return {"error": "rating must be a whole number from 1 to 5."}, 400
    if rating < MIN_RATING or rating > MAX_RATING:
        return {"error": "rating must be a whole number from 1 to 5."}, 400

    source = str(body.get("source") or "external").strip().lower()
    if source not in SOURCES:
        return {"error": "source must be one of: %s." % ", ".join(SOURCES)}, 400

    reasons, rejected = _clean_reasons(body.get("reasons"))
    if rejected:
        return {"error": "unknown reason code(s): %s."
                         % ", ".join(sorted(set(rejected))[:5])}, 400
    # A reason only means anything beside a low score. Silently keeping one
    # attached to a 5 would put it in the low-score tally.
    if rating > 2:
        reasons = []

    comment = str(body.get("comment") or "").strip()
    if len(comment) > MAX_COMMENT_CHARS:
        return {"error": "comment must be %d characters or fewer."
                         % MAX_COMMENT_CHARS}, 400

    key, error = _resolve_target(id, server)
    if error:
        return error

    # THE CONTEXT. Local signature check only -- no provider request, no peer
    # request, no cache read. What the token says about the list is what gets
    # stored; what the body says about it is ignored.
    try:
        context = feedback_context.verify(body.get("feedback_context"), key,
                                          source)
    except feedback_context.ConfigurationError as e:
        print("Feedback rejected: %s" % e)
        return {"error": "Feedback is not configured on this server."}, 503
    except feedback_context.ContextError as e:
        return {"error": e.reason}, e.status

    try:
        respondent = respondent_key(user)
    except ConfigurationError as e:
        print("Feedback rejected: %s" % e)
        return {"error": "Feedback is not configured on this server."}, 503
    if not respondent:
        # An authenticated session with nothing durable to key on. Storing it
        # under a blank identity would pool every such reader into one row.
        return {"error": "This account cannot be identified for feedback."}, 403

    page_at_submit = _page_number(body.get("page_at_submit"),
                                  context["pages"])
    pages_viewed = _page_number(body.get("pages_viewed"), context["pages"])
    # Somebody cannot have looked at fewer pages than the one they are on.
    pages_viewed = max(pages_viewed, page_at_submit)

    now = datetime.utcnow()
    try:
        RecommendationFeedback.objects(
            respondent=respondent, paper_id=key, source=source
        ).update_one(
            set__rating=rating,
            set__reasons=reasons,
            set__comment=comment,
            # From the TOKEN, never from the body: the client does not get to
            # say how many results it was shown.
            set__results_shown=context["results"],
            set__page_at_submit=page_at_submit,
            set__pages_viewed=pages_viewed,
            set__respondent_kind=RESPONDENT_ACCOUNT,
            set__updated_at=now,
            set_on_insert__created_at=now,
            upsert=True)
    except Exception as e:
        # A feedback write must never break a detail page's own behaviour.
        print("Recommendation feedback write failed: %s" % type(e).__name__)
        return {"error": "This rating could not be saved."}, 503

    return {"paper_id": key, "source": source, "rating": rating,
            "reasons": reasons, "comment": comment, "saved": True}, 200


def my_feedback(id, source=None, server=None):
    """
    Read back the signed-in reader's own rating for a record
    Handler for GET: /api/paper/{id}/related/feedback

    Exactly one person's answer -- theirs. It returns no other rating, no
    respondent key, no aggregate and nothing about the recommendations
    themselves, so it cannot become a way to read the room.
    """
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401

    wanted = str(source or "external").strip().lower()
    if wanted not in SOURCES:
        return {"error": "source must be one of: %s." % ", ".join(SOURCES)}, 400

    key, error = _resolve_target(id, server)
    if error:
        return error

    try:
        respondent = respondent_key(user)
    except ConfigurationError as e:
        print("Feedback unavailable: %s" % e)
        return {"error": "Feedback is not configured on this server."}, 503
    if not respondent:
        return {"error": "This account cannot be identified for feedback."}, 403

    try:
        row = RecommendationFeedback.objects(
            respondent=respondent, paper_id=key, source=wanted).first()
    except Exception as e:
        print("Recommendation feedback read failed: %s" % type(e).__name__)
        return {"error": "Feedback could not be read."}, 503

    if not row:
        # Not a 404: "you have not rated this" is a perfectly good answer, and
        # the widget renders its empty state from it.
        return {"paper_id": key, "source": wanted, "rating": None,
                "reasons": [], "comment": ""}, 200
    return {"paper_id": key, "source": wanted, "rating": row.rating,
            "reasons": list(row.reasons or []),
            "comment": row.comment or ""}, 200


def feedback_summary(source=None):
    """
    Aggregate recommendation ratings (admin only; counts, never comments)
    Handler for GET: /api/related/feedback/summary

    Deliberately narrow. It answers "are the recommendations landing?" with
    counts and nothing else: no comment text, no respondent key, no record id,
    no individual response, nothing that could be joined back to a person. An
    operator who needs to read the comments reads the collection directly,
    which is an explicit act with its own access control.

    Only rows keyed to an ACCOUNT are counted. Rows written while anonymous
    rating was allowed have no `respondent_kind` and are left out rather than
    deleted: they were never one-per-reader, so averaging them in would carry
    the old defect into the new number.
    """
    user = get_current_user()
    if not user:
        return {"error": "authentication required"}, 401
    if not is_admin(user):
        return {"error": "administrator access required"}, 403

    query = {"respondent_kind": RESPONDENT_ACCOUNT}
    if source is not None:
        wanted = str(source).strip().lower()
        if wanted not in SOURCES:
            return {"error": "source must be one of: %s."
                             % ", ".join(SOURCES)}, 400
        query["source"] = wanted

    try:
        rows = list(RecommendationFeedback.objects(**query).only(
            "rating", "reasons", "source"))
    except Exception as e:
        print("Recommendation feedback read failed: %s" % type(e).__name__)
        return {"error": "Feedback could not be read."}, 503

    distribution = {str(value): 0 for value in
                    range(MIN_RATING, MAX_RATING + 1)}
    reason_counts = {code: 0 for code in REASONS}
    by_source = {}
    total = 0
    low = 0
    for row in rows:
        rating = int(row.rating or 0)
        if rating < MIN_RATING or rating > MAX_RATING:
            continue
        total += 1
        distribution[str(rating)] += 1
        bucket = by_source.setdefault(row.source or "", {"responses": 0,
                                                         "total": 0})
        bucket["responses"] += 1
        bucket["total"] += rating
        if rating <= 2:
            low += 1
            for code in row.reasons or []:
                if code in reason_counts:
                    reason_counts[code] += 1

    average = (round(sum(int(key) * count
                         for key, count in distribution.items())
                     / float(total), 3) if total else None)
    for bucket in by_source.values():
        bucket["average_rating"] = (round(bucket["total"] / float(
            bucket["responses"]), 3) if bucket["responses"] else None)
        del bucket["total"]

    return {
        "responses": total,
        # None, not 0.0, when nobody has answered: "nobody has rated this" and
        # "everybody rated it 0" are different findings, and 0 is not even a
        # rating a reader can give.
        "average_rating": average,
        "rating_distribution": distribution,
        "low_ratings": low,
        "low_rating_reasons": reason_counts,
        "by_source": by_source,
        "note": "Counts only, from signed-in respondents. Comments, "
                "respondent keys, record ids and individual responses are "
                "deliberately not returned.",
    }, 200
