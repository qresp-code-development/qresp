# Dependency Audit — 2026-07-02 (pre-change baseline)

Latest-version data queried from PyPI / npm on 2026-07-02. "Current" = what
`backend/requirements.lock.txt` / `frontend/package.json` pin today.
Verify commands (backend): `V1` = fresh-venv `pip install -r backend/requirements.txt && python -m pip check`;
`V2` = `python -c "import project; assert project.app.test_client().get('/').status_code == 200"` (cwd `backend/`);
`V3` = `python -m nose2` (cwd `backend/`); `V4` = `docker compose build backend` + DB-backed smoke
(`/api/search`, DAO insert→read); `V5` = connexion middleware test client (post-migration).

## Backend — upgrade / migrate

| Package | Current | Latest | Risk | Breaking changes that matter here | Files affected | Verify |
| --- | --- | --- | --- | --- | --- | --- |
| Flask | 2.2.5 (cap `<2.3`) | 3.1.3 | HIGH | 2.3 removed `flask.json.JSONEncoder`, `before_first_request` (neither used — grep clean); requires Werkzeug ≥3.1. Blocked until Connexion 3 + flask-mongoengine removal | `requirements.txt`, `setup.py` | V1–V5 |
| Werkzeug | 2.2.3 (cap `<2.3`) | 3.1.8 | HIGH | Moves with Flask; no direct `werkzeug` imports in app code | same | V1–V5 |
| Connexion | 2.14.2 (cap `<3.0`) | 3.3.0 | HIGH | v3 is ASGI: `FlaskApp` kept but served via ASGI (uvicorn worker, not plain gunicorn sync); needs extras `[flask,swagger-ui,uvicorn]`; `from connexion import jsonifier` gone (import is unused); `connexion.request` becomes Starlette request → switch to `flask.request`; Swagger-2 body-param passing must be re-verified (`req`, `paper` args) | `project/__init__.py`, `project/api.py`, `run.py`, `project/__main__.py`, `docker-compose*.yml`, `backend/Dockerfile*` | V1–V5 |
| flask-mongoengine | 1.0.0 | **remove** (unmaintained) | MED | Blocks Flask ≥2.3 (removed `flask.json` APIs). Only used as a connection shim — models are plain `mongoengine` | `project/__init__.py`, `project/db.py` | V1–V4 |
| mongoengine | 0.29.3 | 0.29.3 ✓ | — | already latest | — | — |
| pymongo | 4.17.0 | 4.17.0 ✓ | — | already latest | — | — |
| WTForms | 3.2.2 | 3.2.2 ✓ | — | already latest | — | — |
| Flask-Session | 0.8.0 | 0.8.0 ✓ | LOW | `filesystem` type deprecated in favor of cachelib backend (still works; warning) | `project/__init__.py` (later) | V2 |
| flask-sitemap | 0.4.0 | 0.4.0 (stale, 2020) | MED | Unmaintained; Flask-3 compat unproven — verify empirically at Phase C; fallback = small in-app sitemap route | `project/__init__.py` | V2, V3 |
| Flask-Cors | 6.0.5 | 6.0.5 ✓ | — | latest | — | — |
| jsonschema | 4.26.0 | 4.26.0 ✓ | — | `Draft4Validator` still present; needs Python ≥3.10 | — | V3 |
| gunicorn | 26.0.0 | 26.0.0 ✓ | LOW | stays as master process; add `uvicorn-worker` for ASGI (Connexion 3) | compose command | V4 |
| uvicorn / uvicorn-worker | — | 0.49.0 / 0.4.0 | LOW | new deps required by Connexion 3 serving | `requirements.txt` | V4 |
| requests | (transitive only) | 2.34.2 | LOW | used by `project/util.py` but never declared — **add explicitly** | `requirements.txt`, `setup.py` | V1 |
| nose2 / coverage / mongomock / pre-commit / lxml / requests-oauthlib / setuptools | 0.16 / 7.15 / 4.3 / 4.6 / 6.1.1 / 2.0 / latest | all ✓ latest | — | — | — | — |

## Backend — remove (declared but never imported anywhere in `backend/`)

| Package | Current | Evidence / note | Risk |
| --- | --- | --- | --- |
| Flask-API | 3.1 | no `flask_api` import | none |
| Flask-HTTPAuth | 4.8.1 | no import | none |
| flask-profiler | 1.8.1 | no import; unmaintained (2019); drags `simplejson` | none |
| Flask-WTF | 1.3.0 | no import (forms are plain WTForms) | none |
| paramiko | 5.0.0 | no import; drags bcrypt/PyNaCl/cffi | none |
| schedule | 1.2.2 | no import | none |
| py3dns | 4.0.2 | no import | none |
| pyasn1 | 0.6.3 | no import | none |
| validate-email | 1.3 | no import | none |
| pyOpenSSL | 26.3.0 | no import (`import ssl` is stdlib); drags cryptography | none |
| swagger-spec-validator | 3.0.4 | not imported; connexion manages its own spec validation | none |
| itsdangerous / Jinja2 / urllib3 | — | pure transitives of Flask/requests; redundant explicit pins | none |
| coveralls | 4.1.0 | Travis-era; current GitHub workflows never invoke it | none |
| python-dateutil / expiringdict | (setup.py only) | no import | none |

## Docker / CI

| Item | Current | Target | Risk | Note |
| --- | --- | --- | --- | --- |
| backend/Dockerfile base | python:3.11-slim | newest python:3.1x-slim that passes in-container nose2 + boot (try 3.14 → 3.13 → keep 3.11) | LOW-MED | lock is generated on Windows/3.11 — extra env-marker deps (e.g. colorama) install harmlessly on Linux |
| backend/Dockerfile.dev base | **python:3.6-alpine (EOL)** | same base as main image; drop apk build-toolchain hack | LOW | alpine musl forced source builds; slim has wheels |
| compose backend command | gunicorn sync `project:app` | gunicorn `-k uvicorn_worker.UvicornWorker project:connexionapp` (Connexion 3) | MED | deployment-visible change — documented |
| mongodb image | mongo:4.4 | **unchanged** (rule: no blind prod DB bump) | — | 6.0 verified 2026-07-02 on fresh volume; migration notes in FULL_STACK_MODERNIZATION_REPORT.md |
| CI backend-smoke | py3.11 only | matrix 3.11 + Docker-matching version | LOW | actions/checkout@v4, setup-python@v5 already current majors |
| setup.py `python_requires` | >=3.8 | >=3.10 | LOW | jsonschema/coverage/gunicorn/pre-commit already require ≥3.10 |

## Frontend — audited, BLOCKED (no changes this phase)

Toolchain present: Node **14.21.3**, Yarn 1.22.22, no nvm installs. Modern Next
requires Node ≥18.17 (Next 15/16: ≥20). Per the ground rules (no unverifiable
major upgrades), the frontend is documented only.

| Package | Current | Latest | Blocker |
| --- | --- | --- | --- |
| next | 9.4.4 | 16.2.10 | Node ≥20; architectural migration (app router opt-in, webpack→turbopack) |
| react / react-dom | 16.13.1 | 19.2.7 | Node toolchain; enzyme has no adapter ≥17 → RTL migration required |
| @material-ui/* (v4 + v5-alpha mix) | 4.x/5.0.0-alpha | @mui/material 9.1.2 | full import-path + theming migration |
| jest | 26.4.1 | 30.4.2 | with RTL migration |
| axios | 0.19.2 | 1.18.1 | interceptor/error-shape changes — do with the Next upgrade |
| node base image | node:14.21.3-alpine | node:22-alpine | app itself (Next 9) is not Node-20 compatible — image bump only after app upgrade |
