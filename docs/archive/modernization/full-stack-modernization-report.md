# Full-Stack Modernization Report

Branches: `chore/continue-modernization` (waves 1–2, backend) and
`chore/frontend-modernization` (wave 3, frontend) · **Waves 2–3 completed
2026-07-02** · Local-only (no push, no deploy)

Wave-2 commits (each phase verified before commit):
`59e874e` Phase A (prune) → `e626682` Phase B (flask-mongoengine out) →
`9a136ce` Phase D (Connexion 3) → `93d4de6` Phase C (Flask 3) →
`c35e380` Phase F (Docker/CI/lock). Pre-change audit: [dependency audit](dependency-audit-2026-07-02.md).
Wave-3 commits: `043fab9` (frontend app migration) → `208db8c` (node:24 images).

Wave 1 (same day, earlier, merged into baseline `698be1c`) had already delivered
WTForms 2.3.3→3.2.2, the Flask-WTF pin lift, MongoEngine 0.26→0.29.3, PyMongo
3.13→4.17, and the mongo:6.0-on-fresh-volume verification. Wave 2 removed every
remaining backend cap; wave 3 modernized the frontend: **the whole stack now
runs on latest stable dependencies.**

## 1. Dependency upgrade table (before wave 2 → after)

| Package | Before | After | Notes |
| --- | --- | --- | --- |
| Flask | 2.2.5 (capped) | **3.1.3** | cap removable only after Connexion 3 + flask-mongoengine removal |
| Werkzeug | 2.2.3 (capped) | **3.1.8** | moves with Flask |
| Connexion | 2.14.2 (capped) | **3.3.0** | ASGI migration (§3); extras `[flask,swagger-ui,uvicorn]` |
| flask-mongoengine | 1.0.0 | **removed** | unmaintained; blocked Flask ≥2.3; was only a connection shim |
| uvicorn / uvicorn-worker | — | **0.49.0 / 0.4.0** | new: ASGI server + gunicorn worker class |
| starlette / httpx / a2wsgi / asgiref | — | 1.3.1 / 0.28.1 / 1.10.10 / 3.11.1 | Connexion 3 stack |
| requests | transitive-only | **2.34.2 declared** | used by `project/util.py`, was never declared |
| Python (Docker) | 3.11-slim | **3.14-slim** (prod + dev images) | verified in-container; local floor `>=3.10` (`setup.py`) |
| MongoDB (dev compose) | mongo:3.6.18-xenial | **mongo:4.4** | 3.6 is EOL **and unsupported by PyMongo 4.17** (needs server ≥4.0) — the dev DB could no longer connect at all |
| MongoDB (prod compose) | mongo:4.4 | **mongo:4.4 (unchanged)** | rule: no blind prod DB bump; 6.0 path documented (§6) |
| Removed (never imported) | Flask-API, Flask-HTTPAuth, flask-profiler, Flask-WTF, paramiko, schedule, py3dns, pyasn1, validate-email, pyOpenSSL, swagger-spec-validator, coveralls, python-dateutil, expiringdict, cffi, cryptography, + explicit transitives (itsdangerous, Jinja2, urllib3) | — | per-package evidence in DEPENDENCY_AUDIT.md |
| Already latest (wave 1) | mongoengine 0.29.3, pymongo 4.17.0, WTForms 3.2.2, Flask-Cors 6.0.5, Flask-Session 0.8.0, jsonschema 4.26.0, gunicorn 26.0.0, lxml 6.1.1, nose2 0.16, coverage 7.15, mongomock 4.3, pre-commit 4.6 | unchanged | — |

Lock: `requirements.lock.txt` regenerated — **81 → 65 pins** despite adding the
whole ASGI stack. Test count: **17 → 29** (12 new tests).

## 2. Changed files (wave 2)

| File | Change |
| --- | --- |
| `backend/requirements.txt`, `backend/setup.py` | pruned; caps lifted; `test` extra; `python_requires>=3.10` |
| `backend/requirements.lock.txt` | regenerated (65 pins; header documents provenance) |
| `backend/project/__init__.py` | direct `mongoengine.connect()`; Connexion 3 FlaskApp + custom jsonifier; package-relative swagger.yml path; Flask JSON provider |
| `backend/project/db.py` | `MongoDBConnection` re-points via `mongoengine.disconnect()`+`connect()` |
| `backend/project/jsonutil.py` | **new** — mongoengine JSON conversion for Connexion's jsonifier + Flask's provider (replaces flask-mongoengine's patched encoder, same bson json_util shape) |
| `backend/project/api.py` | `from connexion import request, jsonifier` → `from flask import request` |
| `backend/project/views.py` | `RequiredIf` WTForms-3 fix (dict `field_flags`; broken `super()` call) |
| `backend/project/util.py` | `Servers` registry fetches: timeout + graceful `[]` fallback |
| `backend/run.py`, `backend/project/__main__.py` | serve via `connexionapp.run()` (uvicorn); `main()` added — the `qresp` console script entry point was previously broken |
| `backend/project/tests/test_api_endpoints.py` | **new** — 12 tests through the real ASGI middleware |
| `backend/project/tests/test_paperDAO.py` | `assertEquals` → `assertEqual` (aliases removed in Python 3.12) |
| `backend/Dockerfile`, `backend/Dockerfile.dev` | python:3.14-slim (dev was python:3.6-alpine, EOL, apk toolchain dropped) |
| `docker-compose.yml`, `docker-compose.dev.yml` | ASGI serving commands; dev db mongo:4.4 |
| `.github/workflows/backend-smoke.yml` | python matrix 3.11 + 3.14 |
| `.gitignore` + `backend/.coverage` | coverage artifact untracked/ignored |
| `QUICKSTART.md`, `TROUBLESHOOTING.md`, `DEPENDENCY_AUDIT.md` | run commands / counts / pre-change audit |

## 3. Code migration summary

**flask-mongoengine → mongoengine (Phase B).** Models were already plain
mongoengine `Document`s; the extension only translated `app.config['MONGODB_*']`
into `mongoengine.connect()` and patched a JSON encoder into Flask. Replaced
with a direct `connect()` (credentials only passed when configured; the
`app.config` mirror was write-only and dropped) and `project/jsonutil.py` for
the encoder half. `db.py`'s admin re-point now does `disconnect()`+`connect()`
because mongoengine refuses to silently reuse the default alias with new
settings.

**Connexion 2 → 3 (Phase D).** Connexion 3 keeps `FlaskApp` but is ASGI:
routing/validation/swagger-ui run as middleware *around* Flask, so the servable
object is now **`project:connexionapp`** (ASGI), not `project:app` (WSGI).
Production compose serves it with `gunicorn -k uvicorn_worker.UvicornWorker`;
dev compose and `run.py`/`python -m project` use uvicorn (`--reload` in dev).
`from connexion import request, jsonifier` no longer exists: handlers run in
the wrapped Flask request context, so `flask.request` replaces it (the
`jsonifier` import was dead code). Swagger-2 body params still arrive under
their spec names (`req`, `paper`) — covered by a dedicated test. The ~40
server-rendered Flask routes in `routes.py` needed **zero changes**; they are
served through Connexion's ASGI→WSGI bridge (verified).

**JSON serialization parity.** `/api/paper/{id}` returns raw mongoengine
EmbeddedDocuments (`charts`, `datasets`, …). Two layers now serialize where one
did before: Connexion's jsonifier (API responses) and Flask's provider
(`jsonify()` in routes). `project/jsonutil.py` gives both the exact
flask-mongoengine conversion (`json_util._json_convert(doc.to_mongo())`), so
**payload shapes are unchanged for existing clients** — asserted by test and by
a live-HTTP check inside Docker.

**Flask 2.2 → 3.1 (Phase C).** No removed-API usage existed in app code
(grep-verified: no `before_first_request`, `flask.json.JSONEncoder`,
`flask.escape`, direct werkzeug imports). flask-sitemap 0.4.0, Flask-Session
0.8.0 and flask-cors 6.0.5 all work on Flask 3 (boot + `/sitemap.xml` render
verified; Flask-Session's `filesystem` type is deprecated in favor of cachelib
— warning only).

**Latent bugs found and fixed** (all pre-existing, exposed by the new tests):
1. `views.py RequiredIf` used WTForms-2 tuple `field_flags` → **every page
   binding that validator crashed** (`/qrespcurator` 500) on the WTForms 3.2.2
   baseline from wave 1. Also fixed its broken `super(RequiredIf).__init__()`
   (parent init never ran).
2. `util.py Servers` fetched the federated-servers registry with no timeout
   and no error handling; an outage or non-JSON reply 500'd `/qrespcurator`
   and `/qrespexplorer` — **reproduced live against paperstack.uchicago.edu
   during this session**. Now degrades to `[]`.
3. `test_paperDAO.py` used `assertEquals` — removed in Python 3.12, so the
   suite could not run on modern Python (16 errors in-container on 3.14).
4. The `qresp` console script pointed at `project.__main__:main`, which did
   not exist.

## 4. Verification (all on 2026-07-02, this machine)

**Local venvs — clean CPython 3.11.5 (win_amd64), fresh per phase:**

| Check | Result |
| --- | --- |
| `pip install -r requirements.txt` (Phases A/B/D/C each) | OK |
| `pip install -r requirements.lock.txt` (reproducibility, mirrors CI) | OK |
| `python -m pip check` (every venv) | No broken requirements |
| Boot `GET /` via test client (every phase) | 200 |
| `python -m nose2` | **29 tests OK** (17 DAO + 12 new) |

New middleware-path tests (`test_api_endpoints.py`, via Connexion's Starlette
test client — the production traffic path): search/collections/paper/workflow
GETs; **request-validation 400** on a bad body; **Swagger-2 body→`req`
mapping**; **EmbeddedDocument serialization**; Flask-page passthrough (`/`,
`/qrespcurator` with the registry fetch mocked, `/admin`, `/sitemap.xml`);
swagger-ui.

**Docker — Desktop 29.6.1 / Compose v5.1.4 (local daemon only, stopped after):**

| Check | Result |
| --- | --- |
| `docker compose build backend` (python:3.14-slim + new lock) | OK (Python 3.14.6 in-container) |
| prod stack `up` (mongodb 4.4 + backend), gunicorn `-k UvicornWorker` | `GET /`, `/api/search`, `/api/ui/` → **200/200/200** |
| Real-MongoDB round trip (direct `mongoengine.connect` via `QRESP_*` env) | insert → id; tag search reads it back |
| `/api/paper/{id}` over real HTTP | 200; `charts` = list of dicts (serialization parity) |
| `POST /api/dircont` bad body over real HTTP | **400** (validation middleware active in the prod serving path) |
| In-container `python -m nose2` (mongo env unset) on 3.14 | **29 tests OK** (after the `assertEquals` fix) |
| dev compose: build (Dockerfile.dev 3.14-slim) + `up db backend` (uvicorn --reload, mongo:4.4) | `GET /`, `/api/search` → 200 |
| `docker compose config` (prod + dev) and both workflow YAMLs | parse OK |

**CI:** backend-smoke now runs a {3.11, 3.14} matrix with the same
lock+boot+nose2 steps (executes on next push — pushing is out of scope here).

## 5. Frontend (wave 3, 2026-07-02) — DONE

Toolchain: **Node 24.18.0 / npm 11.16 / Yarn 1.22.22** (Yarn 1 kept — minimal
churn; the v1 lockfile regenerated cleanly). Verified locally: `yarn install`
OK, **`yarn build` OK** (Next 16.2.10 on Turbopack; 4 static + 3 dynamic
routes), **`yarn test` OK** (React Testing Library, 2 suites / 5 tests).

| Package | Before | After |
| --- | --- | --- |
| next / react / react-dom | 9.4.4 / 16.13.1 | **16.2.10 / 19.2.7** |
| @material-ui core v5-alpha + icons/lab v4 | mixed | **@mui/material 9.1.2** + icons 9.1.1 (+ material-nextjs, emotion; lab dropped — Alert/Autocomplete/Pagination live in core) |
| react-hook-form / @hookform/resolvers / yup | 6.8 / 0.1 / 0.29 | **7.80 / 5.4 / 1.7** |
| jest + enzyme (+adapter-16, to-json) | 26 / 3.11 | **jest 30 + next/jest + RTL 16** (enzyme removed) |
| axios / ajv | 0.19 / 6 | **1.18 / 8** (ajv `strict:false`; draft-07 schema unchanged) |
| simple-react-lightbox (dead) | 3.2 | **yet-another-react-lightbox 3.32** |
| vis-network | 7 (+hammerjs/keycharm/emitter shims) | **10.1** standalone (shims dropped) |
| fontawesome / react-checkbox-tree / react-transition-group | 5 / 1.6 / 4.4.1 | 7 / 2.0 / 4.4.5 |
| Docker images | node:14.21.3-alpine | **node:24-alpine** (after local build/test passed) |

Migration highlights (details in commit `043fab9`): JSS→emotion (12
makeStyles/withStyles files → `styled()`/`sx`; `_app`/`_document` on the
official `@mui/material-nextjs` pages-router adapter, replacing
ServerStyleSheets); MUI v4 API sweep (justify→justifyContent, `Hidden`→
responsive `sx`, TransitionProps→slotProps, PaperProps→slotProps); RHF v7
(register-as-ref eliminated by registering inside the shared
TextInput/NameInput/RadioInput wrappers, `Controller as`→`render`,
`formState.errors`, dot-syntax field-array names); yup 1 `when()` function
form; new-style `next/link` (no child `<a>`; MUI Buttons render
`component={Link}`); React 19 `CSSTransition` nodeRef wrapper (findDOMNode is
gone); Turbopack import-binding fix; `@mui/icons-material` 9 dropped the bare
`*Outline` aliases → `*Outlined`.

## 6. MongoDB server

Prod compose default stays **mongo:4.4** (the existing `qresp_mongo_data`
volume holds 4.4-format files). mongo:6.0.28 was verified against this backend
on a fresh volume (wave 1). Production upgrade path (do NOT flip the tag
blindly): stepped binary+FCV upgrades 4.4→5.0→6.0 **or**
`mongodump`/`mongorestore` into a fresh 6.0 volume; mongo ≥5.0 additionally
requires an AVX-capable CPU on the host. Dev compose moved 3.6→4.4 out of
necessity (PyMongo 4.17 cannot talk to server 3.6 at all).

## 7. Deployment risks (read before any server rollout)

1. **Serving command changed (biggest delta).** Anything on the server that
   runs `gunicorn ... project:app` must become
   `gunicorn -k uvicorn_worker.UvicornWorker -w 4 -b :5000 project:connexionapp`.
   The repo's compose files already say this; audit for systemd units or
   scripts outside the repo. Serving bare `project:app` still "works" but
   **silently skips API request validation and swagger-ui** — do not.
2. **nginx unchanged** — backend still listens on :5000; no proxy edits needed.
3. **CORS preflight**: GET/POST verified locally; a browser OPTIONS preflight
   through the new middleware stack should be confirmed once on staging.
4. **uvloop**: the lock was generated on Windows, so linux-only uvloop is not
   pinned; uvicorn falls back to asyncio (works; slightly lower throughput).
   Optional: regenerate the lock on Linux or add `uvloop` explicitly.
5. **Removed packages** (paramiko, schedule, …) were never imported by this
   app; but if any *server-side script outside this repo* piggybacked on the
   app's venv for them, it would break — worth a one-time grep on the server.
6. **Python floor is now 3.10** (`setup.py`); the Docker runtime is 3.14. The
   old 3.6-era production image must be rebuilt, not upgraded in place.
7. **Sessions**: Flask-Session 0.8 keeps the `filesystem` backend (deprecation
   warning only); session files are ephemeral and compatible.
8. **Frontend (wave 3)**: the gui image must be rebuilt (node:24). `yarn
   start`/pm2 serving and port are unchanged, so nginx needs no edits.
   `NEXT_PUBLIC_API_URL` env still drives the API base (unchanged). Unit
   coverage is thin (5 tests) — before switching traffic, click through the
   curator forms (react-hook-form v7 rewiring), the chart lightbox
   (replaced library), workflow graphs (vis-network 10), and visually compare
   the styled()-converted components against production.
9. Connexion's own import of Starlette's test client emits a deprecation
   warning (`httpx2`) — cosmetic, upstream, no action needed.

## 8. Remaining blockers / deliberately not done

- **Frontend e2e/browser QA** — the migration is build- and unit-test-green,
  but there is no e2e suite; the §7.8 staging click-through is the gate.
- **MongoDB 6.x in production** — requires the data migration in §6.
- **`verify=False` TLS-verification skips in `util.py`** registry/schema
  fetches — pre-existing; left as-is (behavior-preserving), flagged as a
  security-hardening candidate.
- `modernization_report.md`, `CHECKLIST.md`, `FULL_STACK_MODERNIZATION_CHECKLIST.md`
  are historical wave-0/1 documents; where they conflict, this file wins.

## 9. Exact next steps

1. Push the branch (when you decide to) → CI matrix {3.11, 3.14} runs the
   lock-based smoke; identical steps passed locally.
2. Staging rollout: `docker compose build backend && docker compose up -d`,
   then check `/`, `/api/search`, `/api/ui/`, one POST (`/api/dircont`), a
   browser CORS preflight, and one form page (`/qrespcurator`).
3. Audit the server for out-of-repo `gunicorn ... project:app` invocations
   (risk #1) before switching traffic.
4. Frontend staging QA per §7.8 (forms, lightbox, workflow graph, visual
   parity); consider adding an e2e smoke (Playwright) before the next feature
   phase.
5. Schedule the MongoDB 4.4→6.0 production migration (§6) as an ops task.
6. Optional hardening: enable TLS verification in `util.py` fetches; Linux
   lock regeneration for uvloop; move Flask-Session config off the deprecated
   `filesystem` style before Flask-Session 1.0.

## 10. Reproduce

```bash
# backend, clean CPython 3.10+ venv (use a SHORT venv path on Windows: MAX_PATH)
pip install -r backend/requirements.lock.txt   # or requirements.txt for floating
python -m pip check
cd backend
python -c "import project; print(project.app.test_client().get('/').status_code)"  # 200
python -m nose2                                 # Ran 29 tests ... OK

# serve locally (needs MongoDB, e.g. a mongo:4.4 container)
python -m uvicorn project:connexionapp --host 0.0.0.0 --port 5000 --reload

# docker (local daemon)
docker compose build backend && docker compose up -d mongodb backend
docker compose exec backend python -c "import urllib.request as u; print(u.urlopen('http://localhost:5000/api/search').status)"
docker compose down                             # never `down -v` (keeps the mongo volume)
```

Regenerate the lock after editing `requirements.txt` (clean venv):
`pip freeze | grep -v "^pip==" > requirements.lock.txt`, then re-run the §4
matrix before committing.
