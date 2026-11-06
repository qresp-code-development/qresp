"""Keep OAuth callback secrets out of the application access log.

Uvicorn (and gunicorn) log the full request line, so a successful sign-in
otherwise writes something like::

    GET /api/auth/google/callback?code=4/0AY0e...&state=xUq... HTTP/1.1  302

An authorization ``code`` is single-use and short-lived, and ``state`` is
session-bound, so neither is a standing credential — but both are secrets
for the length of the flow, and access logs are routinely shipped, tailed and
retained far longer than that. Redacting them costs nothing.

This deliberately does NOT silence access logging: the method, path, status
and timing all survive; only the VALUES of sensitive query parameters are
replaced. Anything else in the line is untouched.
"""
import logging
import re

# Parameters whose values must never be logged. `code`/`state` are the OAuth
# flow secrets; `session_state`/`admin_consent` are Microsoft additions;
# `error_description` is provider-authored free text that can carry account
# details. Token parameters are included for completeness — the flows never
# put them in a URL, but a misconfiguration must not turn into a log leak.
SENSITIVE_PARAMS = (
    "code",
    "state",
    "session_state",
    "error",
    "error_description",
    "id_token",
    "access_token",
    "refresh_token",
    "admin_consent",
)

REDACTED = "REDACTED"

_QUERY_RE = re.compile(
    r"(?i)([?&](?:%s)=)([^&\s\"']*)" % "|".join(SENSITIVE_PARAMS))


def redact_query(text):
    """Replace sensitive query-parameter VALUES in an arbitrary string."""
    if not text or not isinstance(text, str):
        return text
    return _QUERY_RE.sub(lambda m: m.group(1) + REDACTED, text)


class SensitiveQueryFilter(logging.Filter):
    """Rewrites a record in place so its formatted output is already safe.

    Access loggers pass the request line through ``record.args``, so the
    substitution has to happen on the args as well as the message template.
    A filter (rather than a formatter) is used so it applies no matter which
    handler or format string the deployment configures.
    """

    def filter(self, record):
        if isinstance(record.msg, str):
            record.msg = redact_query(record.msg)
        args = record.args
        if isinstance(args, tuple):
            record.args = tuple(redact_query(a) if isinstance(a, str) else a
                                for a in args)
        elif isinstance(args, dict):
            record.args = {k: redact_query(v) if isinstance(v, str) else v
                           for k, v in args.items()}
        return True


# The access loggers used by the servers this app is served with. Adding the
# filter to the logger (not a handler) means it applies even when the server
# installs its handlers later, as uvicorn does.
ACCESS_LOGGERS = ("uvicorn.access", "gunicorn.access", "hypercorn.access")


def install(logger_names=ACCESS_LOGGERS):
    """Attach the filter once per logger; safe to call repeatedly."""
    for name in logger_names:
        logger = logging.getLogger(name)
        if not any(isinstance(f, SensitiveQueryFilter)
                   for f in logger.filters):
            logger.addFilter(SensitiveQueryFilter())
