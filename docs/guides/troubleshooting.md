# Qresp Troubleshooting

Known problems, with the error text to search for, the cause, and the fix.
Problems that the 2026 upgrades removed (the old WTForms/Connexion caps, the
Next.js 9 / Node 14 build, the Material-UI version mix) are recorded in the
[modernization archive](../archive/modernization/), not here.

## Backend

### Windows MAX_PATH (long path) install failure

**Symptom**
```
ERROR: Could not install packages due to an OSError: [Errno 2] No such file or
directory: '...\\site-packages\\nose2\\tests\\functional\\support\\scenario\\...'
HINT: ... enable Windows Long Path support ...
```
**Cause** — packages with deeply nested files (e.g. `nose2`) exceed the Windows
260-character path limit when the venv lives under a long directory.
**Fix** — create the venv at a short path (e.g. `C:\qv`), or enable long paths:
`Set-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' LongPathsEnabled 1`
(admin; then restart), or use WSL/Linux.

### MSYS2 / UCRT Python — no matching wheels (Rust build errors)

**Symptom**
```
Python reports SOABI: cpython-310
Unsupported platform: 310
Rust not found, installing into a temporary directory
ERROR: Failed to build 'rpds-py' ...
```
**Cause** — MSYS2/UCRT Python is not a standard CPython, so PyPI ships no
matching wheels. Native packages (`rpds-py` via `jsonschema`, `lxml`,
`cryptography`, `cffi`) then build from source and need toolchains that are not
installed.
**Fix** — use a standard CPython build from python.org.

### MongoDB connection failures (live app)

**Symptom** — `ServerSelectionTimeoutError` / connection refused to
`localhost:27017` when serving the app.
**Cause** — the live app needs a real MongoDB; the test suite does not (it uses
in-memory mongomock).
**Fix** — start MongoDB (e.g. a local `mongo:4.4` container) before
`python -m uvicorn project:connexionapp ...`. Host, port and database come from
`backend/project/config.ini` or the matching `QRESP_MONGODB_*` variables.

## Frontend

### Jest tests fail with "Exceeded timeout of 5000 ms"

**Symptom** — a full `yarn test` run reports a few tests timing out, and a
different few on the next run.
**Cause** — more Jest workers than the machine can feed. `jest.config.js` caps
the suite at four workers for this reason (its comment has the measurements);
raising that with `JEST_WORKERS=…` or `--maxWorkers` on a machine without the
headroom starves the heavier component tests of their 5-second budget. A
timeout is not an assertion failure.
**Fix** — run with the default worker count, or rerun the failing file alone
or the suite with `yarn test --runInBand`. A test that passes there is not
broken; one that fails there is.

## Docker

### nginx exits: cannot load certificate

**Symptom** — `[emerg] cannot load certificate "/etc/certs/nginx.crt"`, or the
image build fails at `COPY nginx.crt`.
**Cause** — TLS certificates are git-ignored and never committed.
**Fix** — generate self-signed dev certificates before building:
```bash
sh nginx/generate-local-certs.sh
```
Production needs real certificates.

### Backend tests error inside the container

**Symptom** — `docker compose run backend python -m nose2` errors on every
test.
**Cause** — with `QRESP_MONGODB_HOST` set, the app connects to the real
MongoDB at import time, which conflicts with the tests' in-memory mongomock.
**Fix** — clear the database variables for the test run (the running app is
unaffected):
```bash
docker compose run --rm --no-deps \
  -e QRESP_MONGODB_HOST= -e QRESP_MONGODB_PORT= -e QRESP_MONGODB_DB_NAME= \
  backend python -m nose2
```

### The dev MongoDB has no authentication

The dev compose runs MongoDB without auth, for local use only. A production
database must enable it.
