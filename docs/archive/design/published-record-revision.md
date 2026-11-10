# Design Note: Published-Record Revision (Edit / Delete)

**Status: DESIGN ONLY — not implemented.** This documents a safe future approach
for letting a submitter revise or retract a published Qresp record. It does not
change current behavior, schema, or auth. Implementation is deferred (see
[summer project checklist](../project-history/summer-project-checklist.md)).

## Goal & non-goals
- **Goal:** a submitter can **edit** or **retract** their own published record,
  without accounts/passwords, reusing Qresp's existing email-verification style.
- **Non-goals:** full user auth, role management, public editing, or hard
  deletion of scientific records.

## What already exists (build on this)
- Publishing already uses **email verification + UUID tokens**: `publish.py`
  generates a `uuid4().hex` id, stores the metadata, and emails a one-time
  `/verify/<id>` link before inserting into MongoDB.
- The schema already carries the submitter identity: `info.insertedBy.emailId`,
  and a record id (`Paper.id`) plus an `info.isPublic` flag.
- An admin/DB **passcode** (`QRESP_DB_SECRET_KEY`, checked by `/verifyPasscode`)
  gates DB-admin actions today.

## Threat model
- **Wrong-person edits:** someone other than the submitter edits/retracts a record.
- **Token leakage:** an edit link is forwarded, logged, or indexed.
- **Brute force:** an attacker guesses the credential.
- **Lost access:** the submitter loses their link/key but legitimately needs to edit.
- **Vandalism / accidental loss:** irreversible deletion of curated data.

## Why a 4-digit passcode alone is not enough
- **Tiny keyspace:** 4 digits = **10,000** combinations — brute-forceable in
  seconds without strict rate limiting/lockout, which are easy to misconfigure.
- **No per-record binding:** a single shared/admin passcode authorizes *any*
  record, so one leak compromises everything (this is fine for trusted DB-admin,
  not for per-record submitter edits).
- **No identity proof:** it proves knowledge of a secret, not that the actor is
  the original submitter.
- **Human factors:** short codes get reused, shared, and shoulder-surfed.
- **Conclusion:** use a **high-entropy, per-record, single-purpose token tied to
  the submitter's email**, not a short global passcode.

## Proposed scheme

### 1. Submitter email (identity anchor)
- The authority for a record is `info.insertedBy.emailId` (already captured).
- All edit/retract authorizations are **delivered to that email** — knowledge of
  the email is not enough; the actor must **receive** a message there.

### 2. Secure edit link (primary path)
- On publish, also mint a **per-record edit token**:
  `edit_token = secrets.token_urlsafe(32)` (~190 bits) — store only a **hash**
  (e.g. SHA-256) on the record, never the raw token.
- Email the submitter a link: `/<record>/edit?token=<raw>`; the server hashes the
  presented token and compares to the stored hash.
- **Properties:** short-lived for a session (e.g. exchange the link for a signed,
  time-boxed edit session cookie, 15–30 min), single active token per record,
  revocable, and **rotated** after each successful edit.

### 3. Optional long revision key (offline backup)
- At publish time, show the submitter a **one-time long revision key** (e.g. a
  32+ char `token_urlsafe`, or a grouped passphrase) and tell them to save it.
- Store only its hash. It allows re-entry without waiting for email (useful for
  shared mailboxes or list addresses). It is **long by design** — this is the
  secure analogue of the rejected "4-digit passcode".

### 4. Lost-key recovery (via email)
- "Lost your key?" → server emails a **fresh, time-boxed** edit link to
  `info.insertedBy.emailId` only. Recovery never reveals the old key; it mints a
  new token and invalidates the old one. This makes email possession the
  fallback root of trust.

### 5. Admin fallback
- Maintainers (already trusted via `QRESP_DB_SECRET_KEY` / server admin) can:
  re-issue an edit link to the submitter, transfer ownership if the email is
  defunct, or perform a retraction on request.
- Admin actions should be **logged** (who/when/why) for an audit trail.

### 6. Soft delete / archive (never hard-delete)
- "Delete" = **retract**: set a status flag (e.g. reuse/extend `info.isPublic` or
  add `info.status: active|archived|retracted`) so the record is hidden from
  search/listing but **retained** in the database with its history.
- Rationale: published scientific records may be cited; preserve provenance,
  allow un-retract, and keep an audit trail. True deletion, if ever required
  (e.g. legal/PII), is an **admin-only** operation, logged, and out of the normal
  submitter flow.
- **Schema note:** prefer an additive, optional status field so existing records
  and the metadata schema stay backward-compatible (no breaking change).

## Operational requirements
- **Rate limiting + lockout** on token/key submission and recovery requests.
- **HTTPS only**; tokens in links are single-purpose and time-boxed.
- **Store hashes, not raw tokens/keys.** Log auth events without logging secrets.
- **Edit = new version, not overwrite:** keep prior versions (the schema already
  has a `versions` array) so edits are auditable and reversible.

## Suggested phasing (when implemented)
1. Mint + email per-record edit token at publish; `/edit` with hashed-token check
   and a short edit session. (Covers the 80% case.)
2. Soft-delete/retract via a status flag + filtered search.
3. Lost-key email recovery + optional long revision key.
4. Admin re-issue/transfer/retract with audit logging.
