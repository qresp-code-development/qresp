"""Session-auth skeleton (Qresp 2.0 checklist, goal 3 — identity only).

Endpoints (wired through swagger.yml, served by Connexion 3):
- GET  /api/auth/me         current session's auth state
- POST /api/auth/logout     clears only the auth user from the session
- POST /api/auth/dev-login  development/staging-only login

Google OAuth will later replace dev-login as the identity provider; /me and
/logout are provider-agnostic and stay as-is. Record ownership and edit
permissions are NOT implemented here (separate phase). No secrets are stored
in the session — only the identity claims below.
"""
import base64
import functools
import hashlib
import re
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode

from werkzeug.security import check_password_hash, generate_password_hash

import jwt
import requests
from flask import redirect, request, session
from requests_oauthlib import OAuth2Session

from project.config import Config

AUTH_SESSION_KEY = "auth_user"
OAUTH_STATE_KEY = "oauth_state"
AUTH_NEXT_KEY = "auth_next"
CSRF_SESSION_KEY = "csrf_token"

# Google OAuth endpoints; [GOOGLE_API] config.ini entries override the
# defaults if present (case-insensitive keys), env QRESP_* overrides both.
GOOGLE_AUTH_URI_DEFAULT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URI_DEFAULT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URI_DEFAULT = "https://openidconnect.googleapis.com/v1/userinfo"
# Identity ONLY. Deliberately hardcoded (not read from config) so no broader
# Google API scope (Drive/Gmail/...) can ever be requested by this flow.
GOOGLE_SCOPES = ["openid", "email", "profile"]

# Microsoft Entra ID (work/school accounts): direct OIDC sign-in for
# universities on Microsoft 365, alongside Google. Configured
# EXCLUSIVELY via environment variables (QRESP_MICROSOFT_CLIENT_ID /
# _CLIENT_SECRET / _REDIRECT_URI, optional _TENANT) — never config.ini.
# The default 'organizations' authority accepts ANY organizational (Entra)
# tenant and EXCLUDES consumer/personal Microsoft accounts. Scopes are
# identity-only and hardcoded: no Microsoft Graph, Outlook, OneDrive, Teams,
# calendar, contacts, or files access can ever be requested by this flow.
MICROSOFT_AUTHORITY_BASE = "https://login.microsoftonline.com"
MICROSOFT_DEFAULT_TENANT = "organizations"
MICROSOFT_SCOPES = "openid profile email"
GITHUB_AUTH_URI = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URI = "https://github.com/login/oauth/access_token"
GITHUB_USER_URI = "https://api.github.com/user"
GITHUB_EMAILS_URI = "https://api.github.com/user/emails"
GITHUB_SCOPES = ["read:user", "user:email"]
GITHUB_STATE_KEY = "github_state"

MICROSOFT_STATE_KEY = "microsoft_state"
MICROSOFT_NONCE_KEY = "microsoft_nonce"
MICROSOFT_PKCE_KEY = "microsoft_code_verifier"
# Entra v2.0 signs id_tokens with RS256; "none" is implicitly rejected.
MICROSOFT_ID_TOKEN_ALGS = ["RS256"]
# The v2.0 issuer embeds the token's own tenant GUID; with the multitenant
# 'organizations' authority the discovery issuer is only a template, so the
# real issuer must be validated against this shape AND the tid claim.
MICROSOFT_ISSUER_RE = re.compile(
    r"^https://login\.microsoftonline\.com/"
    r"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{12})/v2\.0$")
# Tenant values are used in URLs: GUID, domain, or the special authorities.
MICROSOFT_TENANT_RE = re.compile(r"^[A-Za-z0-9._-]+$")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _dev_login_enabled():
    """Dev login is DISABLED unless explicitly switched on.

    Config.get_setting checks the ``QRESP_ENABLE_DEV_LOGIN`` environment
    variable first (standard config.py env override), then an optional
    ``[AUTH] ENABLE_DEV_LOGIN`` entry in config.ini. Production runs without
    either, so the endpoint stays off by default; the check happens per
    request, never trusting frontend route hiding.
    """
    value = Config.get_setting("AUTH", "ENABLE_DEV_LOGIN") or ""
    return value.strip().lower() in ("1", "true", "yes", "on")


def get_current_user():
    """The auth user dict stored in the session, or None when anonymous."""
    return session.get(AUTH_SESSION_KEY)


def issue_csrf_token():
    """Session-bound CSRF token. The frontend reads it from /api/auth/me and
    replays it in the X-CSRF-Token header on mutating same-origin requests."""
    token = session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = token
    return token


def csrf_protect(handler):
    """Require X-CSRF-Token on a mutating route WHEN the request carries an
    authenticated session — cookie-authenticated users are the CSRF target,
    while anonymous API/CLI usage (e.g. anonymous publish) keeps working
    unchanged. dev-login is deliberately not wrapped: it only establishes a
    session (login-CSRF is out of scope for the MVP, and the Google flow is
    already protected by the OAuth state parameter)."""

    @functools.wraps(handler)
    def wrapper(*args, **kwargs):
        if session.get(AUTH_SESSION_KEY):
            expected = session.get(CSRF_SESSION_KEY) or ""
            provided = request.headers.get("X-CSRF-Token") or ""
            if not expected or not secrets.compare_digest(expected, provided):
                return {"error": "CSRF token missing or invalid."}, 403
        return handler(*args, **kwargs)

    return wrapper


def _safe_next_path(value):
    """Validate a post-login redirect target: same-origin path-only strings
    (no scheme/host, no protocol-relative //, no backslash tricks). Returns
    None for anything else, preventing open redirects."""
    if not value or not isinstance(value, str):
        return None
    if not value.startswith("/") or value.startswith("//") or "\\" in value:
        return None
    return value


def _admin_emails():
    """Admin allowlist: QRESP_ADMIN_EMAILS env (comma-separated) via the
    standard config override, or an optional [AUTH] ADMIN_EMAILS ini entry."""
    raw = Config.get_setting("AUTH", "ADMIN_EMAILS") or ""
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def is_admin(user):
    """Admin = allowlisted email, or the session's is_admin claim (dev-login
    only sets it while the endpoint is enabled; Google login will derive it
    from the allowlist at login time)."""
    if not user:
        return False
    if user.get("is_admin"):
        return True
    return (user.get("email") or "").lower() in _admin_emails()


def paper_role(paper, user):
    """The session user's role on a record: 'admin', 'owner', 'editor',
    'viewer' or None. Emails are compared case-insensitively; editor_emails
    and viewer_emails are stored normalized (lowercase) but matched
    defensively anyway. 'viewer' (shared read access to a private record)
    grants no edit or manage rights."""
    if not user:
        return None
    if is_admin(user):
        return "admin"
    email = (user.get("email") or "").strip().lower()
    if not email:
        return None
    owner = (getattr(paper, "owner_email", None) or "").strip().lower()
    if owner and owner == email:
        return "owner"
    editors = getattr(paper, "editor_emails", None) or []
    if email in {(e or "").strip().lower() for e in editors}:
        return "editor"
    viewers = getattr(paper, "viewer_emails", None) or []
    if email in {(e or "").strip().lower() for e in viewers}:
        return "viewer"
    return None


def can_view_paper(paper, user):
    """Permission rule for READING a record (detail, workflow, chart,
    related research). Returns (allowed, reason).

    Public, active record -> everyone. Deactivated -> those who can edit it
    (owner, editor, admin). Private (and active) -> owner, editor, admin and
    the accounts it is shared with (viewer_emails).
    """
    if getattr(paper, "is_active", None) is False:
        return can_edit_paper(paper, user)
    if getattr(paper, "is_private", None) is True:
        role = paper_role(paper, user)
        if role:
            return True, role
        if not user:
            return False, "authentication required"
        return False, "this record is private"
    return True, "public"


def can_edit_paper(paper, user):
    """Permission rule for EDITING a record's metadata. Returns
    (allowed, reason).

    anonymous -> no; admin -> yes; owner -> yes; listed editor -> yes;
    ownerless record (legacy, no owner_email/editors) -> admin only;
    anyone else -> no.
    """
    if not user:
        return False, "authentication required"
    role = paper_role(paper, user)
    if role in ("admin", "owner", "editor"):
        return True, role
    owner = (getattr(paper, "owner_email", None) or "").strip().lower()
    editors = getattr(paper, "editor_emails", None) or []
    if not owner and not editors:
        return False, "record has no owner; only an admin can edit it"
    return False, ("only the record owner, an editor, or an admin can edit "
                   "this record")


def can_manage_paper(paper, user):
    """Permission rule for MANAGING a record (deactivate/reactivate, editor
    list). Stricter than editing: editors are edit-only by design. Returns
    (allowed, reason)."""
    if not user:
        return False, "authentication required"
    role = paper_role(paper, user)
    if role in ("admin", "owner"):
        return True, role
    if role == "editor":
        return False, "editors can edit this record but not manage it"
    owner = (getattr(paper, "owner_email", None) or "").strip().lower()
    if not owner:
        return False, "record has no owner; only an admin can manage it"
    return False, "only the record owner or an admin can manage this record"


def stamp_owner(paper):
    """Attach the verified session identity to a record being published.

    Called on the /api/publish payload before it is validated/stored, so the
    owner survives the email-verification round trip into MongoDB. Anonymous
    publishing stays allowed: without a session the record simply has no
    owner_email (=> admin-only edit later).
    """
    user = get_current_user()
    if user and user.get("email"):
        paper["owner_email"] = user["email"]
    return paper


def _google_config():
    """Google OAuth client settings. Sources, in order: QRESP_GOOGLE_* env
    (via the standard config override), then [GOOGLE_API] entries in
    config.ini. Returns None values when not configured — the app must boot
    and dev-login must keep working without them."""
    cfg = {}
    for key in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
                "GOOGLE_REDIRECT_URI"):
        value = Config.get_setting("GOOGLE_API", key)
        cfg[key] = value.strip() if value else None
    cfg["AUTH_URI"] = (Config.get_setting("GOOGLE_API", "AUTH_URI")
                       or GOOGLE_AUTH_URI_DEFAULT)
    cfg["TOKEN_URI"] = (Config.get_setting("GOOGLE_API", "TOKEN_URI")
                        or GOOGLE_TOKEN_URI_DEFAULT)
    cfg["USER_INFO"] = (Config.get_setting("GOOGLE_API", "USER_INFO")
                        or GOOGLE_USERINFO_URI_DEFAULT)
    return cfg


def _google_ready(cfg):
    return bool(cfg["GOOGLE_CLIENT_ID"] and cfg["GOOGLE_CLIENT_SECRET"]
                and cfg["GOOGLE_REDIRECT_URI"])


def google_login(next=None):
    """GET /api/auth/google — start the Google OAuth identity flow.

    An optional ``next`` query parameter (validated to a same-origin path)
    is remembered in the session so the callback can return the user to the
    page they signed in from.

    ``prompt=select_account`` (as Microsoft's flow already does) so that
    signing out of Qresp and back in lets the user pick a DIFFERENT Google
    account: without it Google silently reuses the single signed-in session
    and the user cannot switch.
    """
    cfg = _google_config()
    if not _google_ready(cfg):
        return {"error": "Google login is not configured on this server."}, 503

    next_path = _safe_next_path(next)
    if next_path:
        session[AUTH_NEXT_KEY] = next_path
    else:
        session.pop(AUTH_NEXT_KEY, None)

    oauth = OAuth2Session(cfg["GOOGLE_CLIENT_ID"],
                          redirect_uri=cfg["GOOGLE_REDIRECT_URI"],
                          scope=GOOGLE_SCOPES)
    authorization_url, state = oauth.authorization_url(
        cfg["AUTH_URI"], prompt="select_account")
    session[OAUTH_STATE_KEY] = state
    return redirect(authorization_url, code=302)


def google_callback(state=None, code=None, error=None):
    """GET /api/auth/google/callback — finish the flow and create the session.

    Tokens are used server-side for the single userinfo fetch and then
    discarded; nothing token-like is stored in the session or sent to the
    frontend.
    """
    cfg = _google_config()
    if not _google_ready(cfg):
        return {"error": "Google login is not configured on this server."}, 503

    if error:
        # The provider's error code is attacker-controllable through a
        # crafted callback URL, so it is logged (bounded) rather than
        # reflected into the page.
        print("Google sign-in returned an error: %s" % str(error)[:100])
        return {"error": "Google sign-in was cancelled or did not "
                         "complete. Please try again."}, 400

    expected_state = session.pop(OAUTH_STATE_KEY, None)
    if not expected_state or not state or state != expected_state:
        return {"error": "Invalid OAuth state, please retry signing in."}, 400
    if not code:
        return {"error": "Missing authorization code."}, 400

    try:
        oauth = OAuth2Session(cfg["GOOGLE_CLIENT_ID"],
                              redirect_uri=cfg["GOOGLE_REDIRECT_URI"],
                              state=expected_state)
        oauth.fetch_token(cfg["TOKEN_URI"],
                          client_secret=cfg["GOOGLE_CLIENT_SECRET"],
                          code=code)
        info = oauth.get(cfg["USER_INFO"]).json()
    except Exception as e:
        # Only the failure SHAPE is logged: oauthlib exceptions can embed the
        # provider's response body (and the request carries the client
        # secret), which must never reach a log file or the user.
        print("Google sign-in failed: %s" % type(e).__name__)
        return {"error": "Google sign-in failed, please try again."}, 400

    email = (info.get("email") or "").strip().lower()
    if not email:
        return {"error": "Google account did not provide an email address."}, 400

    user = {
        "email": email,
        "name": (info.get("name") or "").strip() or email,
        # Google is trusted for identity only; admin comes exclusively from
        # the local allowlist, never from the provider.
        "is_admin": email in _admin_emails(),
        "provider": "google",
        "google_sub": info.get("sub"),
    }
    # Record the durable issuer+subject identity (same account layer as
    # institutional login) so the future ownership migration can reference
    # Google users too. Best-effort: login proceeds without it on failure.
    account_id = _record_external_identity(
        "https://accounts.google.com", info.get("sub"), "google",
        email, user["name"])
    if account_id:
        user["account_id"] = account_id
    user = _with_profile(user)
    session[AUTH_SESSION_KEY] = user
    # Return to the page the user signed in from (re-validated: session data
    # still must not produce an off-origin redirect).
    target = _safe_next_path(session.pop(AUTH_NEXT_KEY, None)) or "/"
    return redirect(target, code=302)


def _record_external_identity(issuer, subject, provider, email, name,
                              idp_name=None):
    """Upsert the durable external identity (keyed by immutable
    issuer+subject) and return its id string.

    Best-effort: session login must never fail because the identity write
    did — the caller proceeds without an account_id on error. No tokens are
    stored, only verified identity claims.
    """
    if not issuer or not subject:
        return None
    try:
        from project.models import ExternalIdentity
        now = datetime.utcnow()
        identity = ExternalIdentity.objects(
            issuer=issuer, subject=str(subject)).first()
        if identity is None:
            identity = ExternalIdentity(
                issuer=issuer, subject=str(subject), provider=provider,
                created_at=now)
        identity.email = (email or "").strip().lower()
        identity.name = name or ""
        if idp_name:
            identity.idp_name = idp_name
        identity.last_login_at = now
        identity.save()
        return str(identity.id)
    except Exception as e:
        print("external identity persistence failed: %s" % e)
        return None


def _oidc_signing_key(jwks_uri, id_token):
    """Resolve the JWKS key matching the token's kid header. Provider-
    agnostic by design (any OIDC provider publishing a standard JWKS). Fetched
    through `requests` (uniformly mockable in tests); verification itself is
    PyJWT's."""
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid")
    response = requests.get(jwks_uri, timeout=10)
    response.raise_for_status()
    for entry in response.json().get("keys", []):
        if kid is None or entry.get("kid") == kid:
            return jwt.PyJWK(entry).key
    raise jwt.InvalidTokenError("no JWKS key matches the ID token")




def _microsoft_config():
    """Microsoft Entra OIDC client settings, environment-only
    (QRESP_MICROSOFT_*). Returns None values when not configured — the app
    must boot, and every other login must keep working, without them."""
    cfg = {}
    for key in ("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET",
                "MICROSOFT_REDIRECT_URI"):
        value = Config.get_setting("MICROSOFT", key)
        cfg[key] = value.strip() if value else None
    tenant = (Config.get_setting("MICROSOFT", "MICROSOFT_TENANT") or "").strip()
    if not tenant or not MICROSOFT_TENANT_RE.match(tenant):
        # Default (and fallback for URL-unsafe values): organizational
        # tenants only — consumer/personal Microsoft accounts stay excluded.
        tenant = MICROSOFT_DEFAULT_TENANT
    cfg["TENANT"] = tenant
    cfg["DISCOVERY_URL"] = (
        "%s/%s/v2.0/.well-known/openid-configuration"
        % (MICROSOFT_AUTHORITY_BASE, tenant))
    return cfg


def _microsoft_ready(cfg):
    return bool(cfg["MICROSOFT_CLIENT_ID"] and cfg["MICROSOFT_CLIENT_SECRET"]
                and cfg["MICROSOFT_REDIRECT_URI"])


# Discovery metadata cache, keyed by discovery URL (process-lifetime).
# Tests clear this between cases.
_microsoft_metadata_cache = {}


def _microsoft_metadata(discovery_url):
    cached = _microsoft_metadata_cache.get(discovery_url)
    if cached:
        return cached
    response = requests.get(discovery_url, timeout=10)
    response.raise_for_status()
    metadata = response.json()
    _microsoft_metadata_cache[discovery_url] = metadata
    return metadata


def _validate_microsoft_id_token(id_token, metadata, cfg, expected_nonce):
    """Full Entra v2.0 ID-token validation: signature against the tenant
    JWKS, audience, expiry, required claims, nonce — plus the multitenant
    issuer rule: the issuer must be the Entra v2.0 issuer FOR THE TOKEN'S OWN
    TENANT (iss GUID == tid claim), because the 'organizations' authority's
    discovery issuer is only a `{tenantid}` template. When a specific tenant
    is configured, the token's tenant must also match it. Raises
    jwt.InvalidTokenError (or subclasses) on any failure."""
    signing_key = _oidc_signing_key(metadata["jwks_uri"], id_token)
    claims = jwt.decode(
        id_token,
        signing_key,
        algorithms=MICROSOFT_ID_TOKEN_ALGS,
        audience=cfg["MICROSOFT_CLIENT_ID"],
        options={
            "require": ["exp", "iat", "iss", "aud", "sub"],
            # The issuer is tenant-dependent under multitenant sign-in;
            # validated manually right below instead of against a constant.
            "verify_iss": False,
        },
    )
    issuer = claims.get("iss") or ""
    matched = MICROSOFT_ISSUER_RE.match(issuer)
    if not matched:
        raise jwt.InvalidIssuerError("unexpected issuer")
    issuer_tenant = matched.group(1).lower()
    tid = (claims.get("tid") or "").lower()
    if not tid:
        raise jwt.InvalidTokenError("missing tenant id (tid) claim")
    if issuer_tenant != tid:
        raise jwt.InvalidIssuerError("issuer tenant does not match tid claim")
    if (cfg["TENANT"].lower() not in ("organizations", "common")
            and tid != cfg["TENANT"].lower()):
        raise jwt.InvalidIssuerError(
            "token tenant does not match the configured tenant")
    if not claims.get("oid"):
        raise jwt.InvalidTokenError("missing object id (oid) claim")
    nonce = claims.get("nonce") or ""
    if not expected_nonce or not secrets.compare_digest(
            str(expected_nonce), str(nonce)):
        raise jwt.InvalidTokenError("nonce missing or mismatched")
    return claims


def microsoft_login(next=None):
    """GET /api/auth/microsoft — start the Microsoft Entra OIDC flow.

    Work/school accounts only (default 'organizations' authority).
    Authorization Code flow with server-side session state, nonce, and PKCE
    (S256); prompt=select_account so a signed-out user can pick a different
    Microsoft account. Identity-only scopes — no Graph/mail/files.
    """
    cfg = _microsoft_config()
    if not _microsoft_ready(cfg):
        return {"error": "Microsoft sign-in is not configured on this "
                         "server."}, 503

    try:
        metadata = _microsoft_metadata(cfg["DISCOVERY_URL"])
    except Exception as e:
        print("Microsoft discovery failed: %s" % e)
        return {"error": "The Microsoft sign-in service could not be "
                         "reached, please try again later."}, 503

    next_path = _safe_next_path(next)
    if next_path:
        session[AUTH_NEXT_KEY] = next_path
    else:
        session.pop(AUTH_NEXT_KEY, None)

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")

    session[MICROSOFT_STATE_KEY] = state
    session[MICROSOFT_NONCE_KEY] = nonce
    session[MICROSOFT_PKCE_KEY] = code_verifier

    params = {
        "response_type": "code",
        "client_id": cfg["MICROSOFT_CLIENT_ID"],
        "redirect_uri": cfg["MICROSOFT_REDIRECT_URI"],
        "scope": MICROSOFT_SCOPES,
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "response_mode": "query",
        # Let the user pick the account each time — after a Qresp logout a
        # different Microsoft identity can be chosen.
        "prompt": "select_account",
    }
    authorization_url = "%s?%s" % (
        metadata["authorization_endpoint"], urlencode(params))
    return redirect(authorization_url, code=302)


def microsoft_callback(code=None, state=None, error=None):
    """GET /api/auth/microsoft/callback — finish the Microsoft Entra flow.

    Verifies state, exchanges the code (PKCE verifier + exact configured
    redirect URI), fully validates the ID token (JWKS signature, audience,
    expiry, nonce, issuer==tid multitenant rule), records the durable
    external identity (issuer + object id — never email), and establishes
    the same session shape every other login uses. Provider tokens are used
    transiently and never persisted.
    """
    cfg = _microsoft_config()
    if not _microsoft_ready(cfg):
        return {"error": "Microsoft sign-in is not configured on this "
                         "server."}, 503

    if error:
        # Same reasoning as the Google flow: never reflect a provider-
        # supplied (URL-controllable) error string back into the page.
        print("Microsoft sign-in returned an error: %s" % str(error)[:100])
        return {"error": "Microsoft sign-in was cancelled or did not "
                         "complete. Please try again."}, 400

    expected_state = session.pop(MICROSOFT_STATE_KEY, None)
    code_verifier = session.pop(MICROSOFT_PKCE_KEY, None)
    expected_nonce = session.pop(MICROSOFT_NONCE_KEY, None)

    if (not expected_state or not state
            or not secrets.compare_digest(str(expected_state), str(state))):
        return {"error": "Invalid OAuth state, please retry signing in."}, 400
    if not code:
        return {"error": "Missing authorization code."}, 400
    if not code_verifier or not expected_nonce:
        return {"error": "Your sign-in session expired, please retry "
                         "signing in."}, 400

    try:
        metadata = _microsoft_metadata(cfg["DISCOVERY_URL"])
        token_response = requests.post(
            metadata["token_endpoint"],
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": cfg["MICROSOFT_REDIRECT_URI"],
                "client_id": cfg["MICROSOFT_CLIENT_ID"],
                "client_secret": cfg["MICROSOFT_CLIENT_SECRET"],
                "code_verifier": code_verifier,
                "scope": MICROSOFT_SCOPES,
            },
            timeout=10,
        )
        token_response.raise_for_status()
        tokens = token_response.json()
    except Exception as e:
        print("Microsoft token exchange failed: %s" % e)
        return {"error": "Microsoft sign-in failed, please try again."}, 400

    id_token = tokens.get("id_token")
    if not id_token:
        return {"error": "Microsoft did not return an identity token."}, 400

    try:
        claims = _validate_microsoft_id_token(
            id_token, metadata, cfg, expected_nonce)
    except Exception as e:
        print("Microsoft ID token rejected: %s" % e)
        return {"error": "The Microsoft identity token could not be "
                         "verified, please retry signing in."}, 400

    # email claim first; preferred_username only when it is actually an
    # email (Entra UPNs usually are, but are not guaranteed to be). No
    # userinfo fallback: Entra's userinfo endpoint lives on Microsoft Graph,
    # which this integration deliberately never calls.
    email = (claims.get("email") or "").strip().lower()
    if not email:
        candidate = (claims.get("preferred_username") or "").strip().lower()
        if _EMAIL_RE.match(candidate):
            email = candidate
    if not email:
        return {"error": "Your Microsoft account did not provide a usable "
                         "email address, which Qresp requires to link your "
                         "records. Please contact the administrators."}, 400

    name = (claims.get("name") or "").strip() or email

    user = {
        "email": email,
        "name": name,
        # Identity comes from Entra; admin comes exclusively from the local
        # allowlist — Microsoft roles/groups/admin claims are never trusted.
        "is_admin": email in _admin_emails(),
        "provider": "microsoft",
    }
    # Durable identity key: the validated tenant-scoped issuer plus the
    # immutable directory object id (oid) — stable even if the email or UPN
    # changes, and never colliding across tenants.
    account_id = _record_external_identity(
        claims.get("iss"), claims.get("oid"), "microsoft", email, name)
    if account_id:
        user["account_id"] = account_id
    user = _with_profile(user)
    session[AUTH_SESSION_KEY] = user

    target = _safe_next_path(session.pop(AUTH_NEXT_KEY, None)) or "/"
    return redirect(target, code=302)


def _github_config():
    """GitHub OAuth client settings (QRESP_GITHUB_* env vars).
    Returns None values when not configured — the app boots fine without them."""
    cfg = {}
    for key in ("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_REDIRECT_URI"):
        value = Config.get_setting("GITHUB", key)
        cfg[key] = value.strip() if value else None
    return cfg


def _github_ready(cfg):
    return bool(cfg["GITHUB_CLIENT_ID"] and cfg["GITHUB_CLIENT_SECRET"]
                and cfg["GITHUB_REDIRECT_URI"])


def github_login(next=None):
    """GET /api/auth/github — start the GitHub OAuth identity flow."""
    cfg = _github_config()
    if not _github_ready(cfg):
        return {"error": "GitHub login is not configured on this server."}, 503

    next_path = _safe_next_path(next)
    if next_path:
        session[AUTH_NEXT_KEY] = next_path
    else:
        session.pop(AUTH_NEXT_KEY, None)

    oauth = OAuth2Session(cfg["GITHUB_CLIENT_ID"],
                          redirect_uri=cfg["GITHUB_REDIRECT_URI"],
                          scope=GITHUB_SCOPES)
    authorization_url, state = oauth.authorization_url(GITHUB_AUTH_URI)
    session[GITHUB_STATE_KEY] = state
    return redirect(authorization_url, code=302)


def github_callback(state=None, code=None, error=None):
    """GET /api/auth/github/callback — finish GitHub OAuth and create session."""
    cfg = _github_config()
    if not _github_ready(cfg):
        return {"error": "GitHub login is not configured on this server."}, 503

    if error:
        print("GitHub sign-in returned an error: %s" % str(error)[:100])
        return {"error": "GitHub sign-in was cancelled or did not complete. "
                         "Please try again."}, 400

    expected_state = session.pop(GITHUB_STATE_KEY, None)
    if not expected_state or not state or state != expected_state:
        return {"error": "Invalid OAuth state, please retry signing in."}, 400
    if not code:
        return {"error": "Missing authorization code."}, 400

    try:
        oauth = OAuth2Session(cfg["GITHUB_CLIENT_ID"],
                              redirect_uri=cfg["GITHUB_REDIRECT_URI"],
                              state=expected_state)
        # GitHub requires Accept header for JSON token response
        oauth.fetch_token(GITHUB_TOKEN_URI,
                          client_secret=cfg["GITHUB_CLIENT_SECRET"],
                          code=code,
                          headers={"Accept": "application/json"})
        user_info = oauth.get(GITHUB_USER_URI,
                              headers={"Accept": "application/json"}).json()
    except Exception as e:
        print("GitHub sign-in failed: %s" % type(e).__name__)
        return {"error": "GitHub sign-in failed, please try again."}, 400

    # Email is the ownership key, so only an address GitHub reports as
    # VERIFIED is accepted: the primary one if verified, else the profile's
    # public email if it is among the verified ones. The emails endpoint
    # (user:email scope) is the only source of the verified flag.
    email = ""
    try:
        emails = oauth.get(GITHUB_EMAILS_URI,
                           headers={"Accept": "application/json"}).json()
        verified = [(e.get("email") or "").strip().lower()
                    for e in emails
                    if isinstance(e, dict) and e.get("verified")]
        primary = next(
            ((e.get("email") or "").strip().lower() for e in emails
             if isinstance(e, dict) and e.get("primary") and e.get("verified")),
            "",
        )
        public = (user_info.get("email") or "").strip().lower()
        email = primary or (public if public and public in verified else "")
    except Exception:
        pass

    if not email:
        return {"error": "GitHub account did not provide a verified email address. "
                         "Make sure your email is verified on GitHub."}, 400

    name = (user_info.get("name") or user_info.get("login") or "").strip() or email
    user = {
        "email": email,
        "name": name,
        "is_admin": email in _admin_emails(),
        "provider": "github",
        "github_id": user_info.get("id"),
    }
    account_id = _record_external_identity(
        "https://github.com", str(user_info.get("id", "")), "github",
        email, name)
    if account_id:
        user["account_id"] = account_id
    user = _with_profile(user)
    session[AUTH_SESSION_KEY] = user
    target = _safe_next_path(session.pop(AUTH_NEXT_KEY, None)) or "/"
    return redirect(target, code=302)


def me():
    """GET /api/auth/me — report the current authentication state. Also
    issues the session's CSRF token for the frontend to replay on mutations."""
    user = session.get(AUTH_SESSION_KEY)
    token = issue_csrf_token()
    if not user:
        return {"authenticated": False, "user": None, "csrf_token": token}, 200
    return {"authenticated": True, "user": user, "csrf_token": token}, 200


@csrf_protect
def logout():
    """POST /api/auth/logout — clear only auth-related session data."""
    session.pop(AUTH_SESSION_KEY, None)
    return {"success": True}, 200


PROFILE_FIELDS = ("affiliation", "bio", "orcid_id", "google_scholar_url",
                  "website_url", "avatar_b64")


def _load_profile(email):
    """The stored UserProfile for an email, or None. Best-effort: a profile
    lookup failure must never block sign-in."""
    try:
        from project.models import UserProfile
        return UserProfile.objects(email=(email or "").strip().lower()).first()
    except Exception as e:
        print("Profile lookup failed: %s" % type(e).__name__)
        return None


def _with_profile(user):
    """Merge the user's stored profile into a fresh session identity. A name
    saved on the profile wins over the provider-asserted one."""
    profile = _load_profile(user.get("email"))
    if not profile:
        return user
    merged = dict(user)
    for f in PROFILE_FIELDS:
        value = getattr(profile, f, "") or ""
        if value:
            merged[f] = value
    if profile.name:
        merged["name"] = profile.name
    return merged


def public_profile(email):
    """Public-facing profile fields for an email, or None (never the email)."""
    profile = _load_profile(email)
    if not profile:
        return None
    out = {f: getattr(profile, f, "") or "" for f in PROFILE_FIELDS}
    out["name"] = profile.name or ""
    return out


# Email/password accounts must prove the address before they can sign in:
# email is the key for record ownership and the admin allowlist, so an
# unverified address would let anyone claim someone else's records.
VERIFY_TOKEN_TTL = timedelta(hours=24)
VERIFY_RESEND_INTERVAL = timedelta(minutes=2)


def _token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _public_url():
    """Origin used in emailed links. Taken from QRESP_PUBLIC_URL (or
    [GLOBAL] PUBLIC_URL), never from the request: Origin and Host are
    client-controlled, and a forged one would mail the token to another site.
    Only with dev-login on (local/staging) does it fall back to the request's
    own host. Returns None when no trusted origin is available."""
    configured = (Config.get_setting("GLOBAL", "PUBLIC_URL") or "").strip()
    if configured:
        return configured.rstrip("/")
    if _dev_login_enabled():
        return (request.host_url or "").rstrip("/") or None
    return None


def _skip_email():
    value = Config.get_setting("PUBLISH", "PUBLISH_SKIP_EMAIL") or ""
    return value.strip().lower() in ("1", "true", "yes", "on")


def _send_verification(account, base_url):
    """Issue a fresh confirmation token for ``account`` (replacing any older
    one) and email the link. Returns the link only in skip-email mode
    (staging QA), otherwise None. Raises if the email cannot be sent."""
    token = secrets.token_urlsafe(32)
    account.verify_token_hash = _token_hash(token)
    account.verify_sent_at = datetime.utcnow()
    account.save()
    link = "%s/verify-email?token=%s" % (base_url, token)
    if _skip_email():
        return link

    from project.utils.mail import mailClient
    name = account.name or account.email
    html = """
    <html>
        <body>
            <p>
                Hello {0},<br><br>
                Please confirm your email address to finish creating your
                Qresp account. Open the link below and enter the password you
                chose:<br><br>
                <a href="{1}">{1}</a><br><br>
                The link expires in 24 hours. If you did not create a Qresp
                account, ignore this email; no account will be activated.<br><br>
                The Qresp Team
            </p>
        </body>
    </html>
    """.format(name, link)
    text = ("Please confirm your email address to finish creating your "
            "Qresp account: %s\n\nThe link expires in 24 hours. If you did "
            "not create a Qresp account, ignore this email." % link)
    mailClient.send("Confirm your Qresp account", text, html, account.email)
    return None


def _local_session_user(account):
    user = _with_profile({
        "email": account.email,
        "name": account.name or account.email,
        "is_admin": account.email in _admin_emails(),
        "provider": "local",
    })
    session[AUTH_SESSION_KEY] = user
    return user


def local_register(body):
    """POST /api/auth/register — create an email/password account.

    The account stays inactive until the emailed confirmation link is
    opened (``verify_email``); nobody is signed in here. Email is
    case-insensitively normalised and serves as the linking key across all
    sign-in providers: a LocalAccount and an ExternalIdentity (Google /
    Microsoft) that share the same email address share the same paper
    ownership records.

    Registering an address that is still unconfirmed replaces the pending
    sign-up (new password, new link, old link void), so whoever started it
    first cannot hold the address hostage: only the inbox owner can confirm.
    """
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    name = (body.get("name") or "").strip()
    affiliation = (body.get("affiliation") or "").strip()

    if not _EMAIL_RE.match(email):
        return {"error": "A valid email address is required."}, 400
    if len(password) < 8:
        return {"error": "Password must be at least 8 characters."}, 400
    if len(affiliation) > 300:
        return {"error": "Affiliation is too long (max 300 characters)."}, 400

    base_url = _public_url()
    if not base_url:
        print("Email sign-up refused: QRESP_PUBLIC_URL is not set.")
        return {"error": "Creating an account with email is not available "
                         "on this server. Please use another sign-in "
                         "option."}, 503

    from project.models import LocalAccount, UserProfile
    now = datetime.utcnow()

    account = LocalAccount.objects(email=email).first()
    if account and account.email_verified:
        return {"error": "An account with this email already exists. "
                         "Please sign in instead."}, 409
    if not account:
        account = LocalAccount(email=email, created_at=now)
    account.password_hash = generate_password_hash(password)
    account.name = name or email
    account.email_verified = False
    account.save()

    if affiliation:
        UserProfile.objects(email=email).update_one(
            upsert=True, set__affiliation=affiliation, set__updated_at=now)

    try:
        link = _send_verification(account, base_url)
    except Exception as e:
        print("Confirmation email failed: %s" % type(e).__name__)
        return {"error": "We could not send the confirmation email. Please "
                         "try again later."}, 503

    out = {"authenticated": False, "verification_required": True,
           "email": email}
    if link:
        out["verify_link"] = link
    return out, 200


def local_login(body):
    """POST /api/auth/local-login — sign in with email and password.

    An unconfirmed account is refused (403) after the password checks out,
    and a new confirmation link is sent unless one went out moments ago.
    """
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    if not email or not password:
        return {"error": "Email and password are required."}, 400

    from project.models import LocalAccount
    account = LocalAccount.objects(email=email).first()
    if not account or not check_password_hash(account.password_hash, password):
        return {"error": "Invalid email or password."}, 401

    if not account.email_verified:
        out = {"verification_required": True, "email": email}
        sent_at = account.verify_sent_at
        recent = sent_at and datetime.utcnow() - sent_at < VERIFY_RESEND_INTERVAL
        base_url = _public_url()
        if not recent and base_url:
            try:
                link = _send_verification(account, base_url)
                if link:
                    out["verify_link"] = link
            except Exception as e:
                print("Confirmation email failed: %s" % type(e).__name__)
        out["error"] = ("Please confirm your email address first. We sent a "
                        "confirmation link to %s; it may take a few minutes "
                        "to arrive." % email)
        return out, 403

    account.last_login_at = datetime.utcnow()
    account.save()
    user = _local_session_user(account)
    return {"authenticated": True, "user": user}, 200


def verify_email(body):
    """POST /api/auth/verify-email — confirm an email/password account.

    Needs the token from the emailed link AND the account's password: the
    password proves the person confirming is the one who signed up, so a
    stranger who registers your address cannot get you to activate it for
    them by clicking the link. Success signs the account in.
    """
    token = (body.get("token") or "").strip()
    password = body.get("password") or ""
    invalid = ({"error": "This confirmation link is invalid or has expired. "
                         "Sign in with your email and password to get a new "
                         "one."}, 400)
    if not token or not password:
        return invalid

    from project.models import LocalAccount
    account = LocalAccount.objects(verify_token_hash=_token_hash(token)).first()
    if (not account or not account.verify_sent_at
            or datetime.utcnow() - account.verify_sent_at > VERIFY_TOKEN_TTL):
        return invalid
    if not check_password_hash(account.password_hash, password):
        return {"error": "Incorrect password. Enter the password you chose "
                         "when you created the account."}, 401

    now = datetime.utcnow()
    account.email_verified = True
    account.verify_token_hash = None
    account.verify_sent_at = None
    account.last_login_at = now
    account.save()
    user = _local_session_user(account)
    return {"authenticated": True, "user": user}, 200


def _validate_url(value, label):
    """Return an error string if value looks like a non-empty invalid URL."""
    if not value:
        return None
    if not (value.startswith("http://") or value.startswith("https://")):
        return "%s must start with http:// or https://" % label
    if len(value) > 500:
        return "%s is too long (max 500 characters)." % label
    return None


@csrf_protect
def update_profile(body):
    """PATCH /api/auth/profile — update profile fields for the signed-in user.

    Persisted to UserProfile (keyed by email) for every sign-in provider, so
    the profile survives logout and can be shown on the user's records.
    Omitting avatar_b64 leaves the stored photo unchanged; "" removes it.
    """
    user = get_current_user()
    if not user:
        return {"error": "Not authenticated."}, 401

    name = (body.get("name") or "").strip()
    if not name:
        return {"error": "Name cannot be empty."}, 400
    if len(name) > 200:
        return {"error": "Name is too long (max 200 characters)."}, 400

    affiliation = (body.get("affiliation") or "").strip()
    if len(affiliation) > 300:
        return {"error": "Affiliation is too long (max 300 characters)."}, 400

    bio = (body.get("bio") or "").strip()
    if len(bio) > 500:
        return {"error": "Bio is too long (max 500 characters)."}, 400

    orcid_id = (body.get("orcid_id") or "").strip()
    if len(orcid_id) > 40:
        return {"error": "ORCID iD is too long."}, 400

    google_scholar_url = (body.get("google_scholar_url") or "").strip()
    err = _validate_url(google_scholar_url, "Google Scholar URL")
    if err:
        return {"error": err}, 400

    website_url = (body.get("website_url") or "").strip()
    err = _validate_url(website_url, "Website URL")
    if err:
        return {"error": err}, 400

    avatar_b64 = (body.get("avatar_b64") or "").strip()
    if len(avatar_b64) > 700000:
        return {"error": "Profile photo is too large (max ~500 KB)."}, 400
    if avatar_b64 and not avatar_b64.startswith("data:image/"):
        return {"error": "Profile photo must be an image."}, 400

    updates = {
        "name": name,
        "affiliation": affiliation,
        "bio": bio,
        "orcid_id": orcid_id,
        "google_scholar_url": google_scholar_url,
        "website_url": website_url,
    }
    if "avatar_b64" in body:
        updates["avatar_b64"] = avatar_b64

    from project.models import LocalAccount, UserProfile
    email = user["email"]
    UserProfile.objects(email=email).update_one(
        upsert=True, set__updated_at=datetime.utcnow(),
        **{"set__" + k: v for k, v in updates.items()})
    if user.get("provider") == "local":
        LocalAccount.objects(email=email).update_one(set__name=name)

    user = {**user, **updates}
    session[AUTH_SESSION_KEY] = user
    return {"authenticated": True, "user": user}, 200


def dev_login(credentials):
    """POST /api/auth/dev-login — dev/staging-only session login.

    Body: {"email": required, "name": optional (defaults to email),
    "is_admin": optional (defaults to false)}.
    """
    if not _dev_login_enabled():
        return {"error": "Not found"}, 404

    email = (credentials.get("email") or "").strip().lower()
    if not email:
        return {"error": "email is required"}, 400

    user = {
        "email": email,
        "name": (credentials.get("name") or "").strip() or email,
        "is_admin": bool(credentials.get("is_admin", False)),
        "provider": "dev",
    }
    user = _with_profile(user)
    session[AUTH_SESSION_KEY] = user
    return {"authenticated": True, "user": user}, 200
