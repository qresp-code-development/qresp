# Microsoft Entra Sign-in — Setup Guide

Qresp offers a direct **"Sign in with Microsoft"** for university/work
accounts on Microsoft Entra ID (Azure AD), including UChicago accounts where
the campus tenant policy permits it. Microsoft and Google are the two
supported public providers; both establish the same Qresp session and flow
through the same ownership/editor/admin checks.

**Identity only.** The flow requests exactly `openid profile email` and
validates the returned ID token. **No Microsoft Graph, Outlook, OneDrive,
Teams, calendar, contacts, or files scopes are requested, and no Microsoft
API is ever called with the user's token** (even the Graph-hosted OIDC
userinfo endpoint is deliberately not used). Access/refresh/ID tokens are
used transiently for verification and never persisted.

**⚠️ Never commit credentials.** Client id/secret live ONLY in server
environment variables — never in config.ini, compose files, or Git.

## App registration (manual, one-time per environment)

1. https://entra.microsoft.com → **App registrations** → **New registration**.
2. Name: e.g. `Qresp (staging)` / `Qresp`.
3. **Supported account types**: choose
   **"Accounts in any organizational directory"** (multitenant work/school).
   Do NOT include personal Microsoft accounts — Qresp's default
   `organizations` authority excludes them regardless.
4. **Redirect URI** — platform **Web**, exactly matching the server config:
   - Staging (SSH tunnel): `https://localhost:8443/api/auth/microsoft/callback`
   - Production: `https://<production-domain>/api/auth/microsoft/callback`
   Register staging and production as separate app registrations (or at
   least separate redirect URIs); each environment sets its own
   `QRESP_MICROSOFT_REDIRECT_URI` to its exact registered value.
5. **Certificates & secrets** → new client secret; note it once (it is the
   env value, nothing else). Mind its expiry date for rotation.
6. No API permissions beyond the default OpenID ones (`openid`, `profile`,
   `email`) are needed; do not add Microsoft Graph permissions.

## Environment variables (names only — values never in Git)

| Variable | Meaning |
| --- | --- |
| `QRESP_MICROSOFT_CLIENT_ID` | Application (client) ID, e.g. `<guid>` |
| `QRESP_MICROSOFT_CLIENT_SECRET` | Client secret value, e.g. `<secret>` |
| `QRESP_MICROSOFT_REDIRECT_URI` | The exact registered callback URL for THIS environment |
| `QRESP_MICROSOFT_TENANT` | Optional. Default `organizations` (any work/school tenant). Set a tenant GUID to pin logins to one university's tenant. |

When unset, `GET /api/auth/microsoft` returns a clear JSON 503 and every
other login (Google, and staging dev-login) is unaffected.

## What the backend implements

- OIDC Authorization Code flow at
  `https://login.microsoftonline.com/<tenant>/v2.0` with server-side session
  **state**, **nonce**, and **PKCE (S256)**; exact redirect URI both legs;
  `prompt=select_account` so a signed-out user can pick a different account.
- ID token validated with PyJWT against the Entra JWKS: signature (RS256),
  audience, expiry, required claims, nonce — plus the multitenant issuer
  rule: `iss` must be `https://login.microsoftonline.com/<tid>/v2.0` for the
  token's own `tid` claim, and must match `QRESP_MICROSOFT_TENANT` when a
  specific tenant is pinned.
- Durable identity: `ExternalIdentity` keyed by the tenant-scoped issuer +
  immutable directory object id (`oid`) — never by email. Email is taken
  from the `email` claim, falling back to `preferred_username` only when it
  is a real email; without a usable email the login fails safely and no
  session is created.
- Admin rights come ONLY from `QRESP_ADMIN_EMAILS`; Entra roles/groups/admin
  claims are ignored. Record ownership/editor access works through the
  existing email matching — records are never auto-claimed or migrated.
- Qresp logout clears only the Qresp session; it never attempts a global
  Microsoft/campus sign-out.

## Tenant-admin consent note

Some universities restrict which multitenant apps members may consent to. If
a user sees an Entra "Need admin approval" screen, that campus requires its
IT/tenant admin to grant consent to the Qresp app registration (identity
scopes only) before logins from that tenant succeed. Until that is
granted, members of such a campus can sign in with Google instead.

## Staging QA after registration (E2E — still to do)

Not yet verified against a real Entra tenant (no app registration exists).
After registering and setting the env vars, restart the staging backend
container (bind-mount: restart, not rebuild), then:

1. Anonymous → "Sign in with Microsoft" → Microsoft account picker appears.
2. Sign in with a UChicago (or any organizational) account → you return to
   the page you started on; header shows your name; `/account` shows
   "Signed in with Microsoft".
3. Publish → verify → edit → drafts → (allowlisted email) admin surfaces
   work through the session.
4. Sign out of Qresp → click "Sign in with Microsoft" again → the account
   PICKER appears (select_account), allowing a different account.
5. Unset the env vars → the button yields the JSON 503; Google (and
   staging dev-login) still work.
