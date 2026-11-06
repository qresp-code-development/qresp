# Full-Stack Modernization Checklist

**Status: COMPLETE (2026-07-02)** — all planned steps done; results in
`FULL_STACK_MODERNIZATION_REPORT.md`.

Branch: `chore/full-stack-modernization` (from `chore/modernize-dev-environment`).
Scope: modernize deps toward latest **compatible + verified** versions; keep the
app runnable/testable. No Google login, no Account/Edit, no AI.

## Current stack (audited)

**Backend** — Python 3.11 (Docker) / `>=3.8` (setup.py)
- Flask 2.2.5, Werkzeug 2.2.3
- Connexion 2.14.2 — uses `connexion.FlaskApp`, `add_api(swagger.yml)`,
  `from connexion import request, jsonifier` (`project/api.py`, `__init__.py`, `db.py`)
- MongoEngine 0.26, PyMongo 3.13, flask-mongoengine 1.0.0
- WTForms 2.3.3 — `from wtforms.fields.html5 import EmailField, IntegerField` (`views.py`)
- Flask-WTF `<1.0` — **not imported anywhere** (pin unnecessary)
- Tests: `nose2` (17), `mongomock` via removed `mongomock://` URI
- Docker base: `python:3.11-slim` (already modern), installs `requirements.lock.txt`

**Frontend** — Node **14.21.3** (only toolchain available), npm 6, Yarn 1
- Next.js 9.4.4, React/react-dom 16.13.1
- Material-UI: `@material-ui/core@^5.0.0-alpha.2` mixed with
  `@material-ui/icons@^4` and `@material-ui/lab@^4-alpha` (inconsistent)
- Tests: jest 26 + enzyme 3 (+ enzyme-adapter-react-16)
- Docker base: `node:14.21.3-alpine`

## Target stack

**Backend (this task — verifiable):** Python 3.11; **WTForms → 3.x**,
drop Flask-WTF pin; **MongoEngine → 0.29.x**, **PyMongo → 4.x**; keep Flask
2.2.x / Werkzeug 2.2.x / Connexion 2.14.x.
**Deferred (documented blockers):** Flask 3 / Werkzeug 3 (blocked by Connexion 2's
`flask<2.3` cap + flask-mongoengine); Connexion 3 (ASGI rewrite, `jsonifier`
removed, new App API).

**Frontend (target, but toolchain-blocked here):** Node 20 LTS, Next 14, React 18,
`@mui` v5, RTL. **Blocked**: only Node 14 is installed → modern Next needs Node
≥18.17, so a modernized frontend cannot be installed/built/verified in this
environment. Audit + staged plan only; no unverifiable dep changes.

**Docker:** backend stays `python:3.11-slim` + lock; with PyMongo 4 the DB image
can move `mongo:4.4 → 6.0` (verify).

## Migration risks
- Connexion 2→3 = full ASGI rewrite (HIGH) — out of scope, documented.
- flask-mongoengine unmaintained — main blocker for Flask 3; keep for now.
- Frontend Node-14 toolchain blocks modern Next/React (HIGH); needs Node 20.
- enzyme is dead (no React 17/18 adapter) — RTL migration needed with frontend.

## Planned order
1. [x] Backend code fixes (WTForms html5 import; mongomock test setUp) — commit `b57a8ea`.
2. [x] Backend deps: unpin WTForms/Flask-WTF/MongoEngine/PyMongo; keep Flask/Connexion caps — commit `b57a8ea`.
3. [x] Verify backend (install, pip check, boot, GET /, nose2) — clean Py3.11.5 venv,
   2026-07-02: pip check OK, GET / → 200, nose2 17 OK.
4. [x] Regenerate `requirements.lock.txt` — 2026-07-02, from the verified clean venv
   (WTForms 3.2.2 / Flask-WTF 1.3.0 / mongoengine 0.29.3 / pymongo 4.17.0).
5. [x] Docker: backend image rebuilt on the new lock; mongodb+backend smoke vs
   mongo:4.4 (GET /, /api/search → 200; DAO insert→read; in-container nose2 17 OK);
   **mongo:6.0.28 verified** on a fresh throwaway volume — compose default stays 4.4
   (existing volume is 4.4-format; migration path documented in the report).
6. [x] Frontend: audit + blockers documented (Node 14.21.3/Yarn 1.22.22 toolchain;
   modern Next needs Node ≥ 18.17; no unverifiable dep changes made).
7. [x] Report — `FULL_STACK_MODERNIZATION_REPORT.md`.

## Verification commands
```
# backend (clean CPython 3.11 venv)
pip install -r backend/requirements.txt
python -m pip check
python -c "import project; print(project.app.test_client().get('/').status_code)"  # 200
python -m nose2                     # (mongomock; no MongoDB)
# docker
docker compose config
docker compose build backend
docker compose up --build           # /api/search 200, DAO insert/read
# frontend (needs Node — only 14 here; modern build not verifiable)
cd frontend && yarn install && yarn build && yarn test
```

## Rollback strategy
Work isolated on `chore/full-stack-modernization`; small commits per concern.
Any breaking migration (Connexion 3 / Flask 3 / frontend) is documented and NOT
applied, so the branch never lands half-upgraded. Revert = drop the branch.

## Success = 
- Backend: WTForms 3 + MongoEngine 0.29 + PyMongo 4 installed, `pip check` clean,
  boots, `GET / → 200`, **nose2 passes**, Docker builds & DB-backed runtime works.
- Frontend: modern target + staged plan documented with the exact Node-14 blocker.
- Report clearly separates upgraded / verified / blocked, and states readiness for
  the Account/User + Google-login phase.
