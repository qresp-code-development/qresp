# Publish

## How it works

Publishing requires a signed-in account. Every sign-in proves the account's
email address once: Google, Microsoft and GitHub through the provider, and
email/password accounts through the confirmation link sent when the account
is created. A record is therefore published as soon as the curator clicks
**Publish**; there is no per-record email step.

### Flow

1. The curator form sends the record as JSON (see `backend/project/schema.json`)
   to `POST /api/publish`, with the session cookie and CSRF token.
2. The backend refuses anonymous requests (401), checks the workflow graph and
   the schema (400 with the reason), stamps `owner_email` from the session
   (any client-supplied owner is discarded), and inserts the record.
3. The response is `{"success": true, "id": "<record id>"}`; the curator sees
   a confirmation with a link to `/paperdetails/<id>`.

## History

Up to release 1.2.2, publishing asked the curator to sign in with Google.
From 2.0 until 3.0, `POST /api/publish` queued the record in
`papers/publish/` and emailed a link; opening it (`/verify/{id}`, which calls
`GET /api/verify/{id}`) inserted the record. That route is kept so links
emailed before the change still work, but new publishes never queue.

## Contributing

Always welcome, thanks. Suggestions, pull requests welcome. If you find a bug please, open an issue on GitHub.
