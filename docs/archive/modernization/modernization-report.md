# Qresp Modernization Report

_Repository-modernization audit of the development environment and dependencies._
_Scope: tooling and dependencies only — no application behavior, schema, UI, auth,
or feature changes._

## 1. Summary

| Area | State | Action taken |
| --- | --- | --- |
| Backend runtime deps | Unpinned; coupled to the **Flask 2.x / WTForms 2.x / connexion 2.x** generation by the source code | Added the minimal compatibility upper bounds the code already requires; removed one broken dep |
| Backend dev/CI deps | `python-coveralls` abandoned; `swaggerpy` Python-2-only (breaks install) | Replaced / removed |
| pre-commit | **Broken**: `git://` protocol (disabled by GitHub, Jan 2022); deprecated flat format; `flake8` hook moved repos | Rewritten to working modern config |
| CI | **Travis CI (`.travis.yml`) is defunct** (travis-ci.org shut down) | Added GitHub Actions workflow for the prototype suite |
| Docker | `python:3.6-alpine` (EOL), `mongo:3.6.18` (EOL) | Documented recommended bumps (not changed — unbuildable/untestable here) |
| Frontend | Next 9 / React 16 / Material-UI v4+v5-alpha mix / axios 0.19 | Documented; **not changed** (Node toolchain unavailable; upgrades are architectural) |
| Python version | `>=3.6` (EOL) | Raised floor to `>=3.8`; recommended 3.10/3.11 |

**Tooling available in this environment:** Python 3.11. **Not available:** Node /
npm / yarn, Docker, MongoDB. Therefore only the prototype test suite could be
executed (130 passed); backend and frontend changes were limited to what is
verifiable by static reasoning and are flagged accordingly below.

## 2. How "outdated" was assessed

The backend dependency files (`requirements.txt`, `setup.py`) pin **nothing**, so
"latest on install" silently pulls breaking majors. The actual ceiling is
imposed by the source code:

| Source usage | Removed in | Hard ceiling required |
| --- | --- | --- |
| `from wtforms.fields.html5 import EmailField, IntegerField` (`project/views.py`) | WTForms 3.0 | `WTForms<3.0` |
| (WTForms<3 ⇒) Flask-WTF 1.0 requires WTForms≥3.0 | Flask-WTF 1.0 | `Flask-WTF<1.0` |
| `from connexion import request, jsonifier` (`project/api.py`) | connexion 3.0 (full rewrite) | `connexion[swagger-ui]<3.0` |
| `flask-mongoengine` 1.0 uses `flask.json.JSONEncoder` | Flask 2.3 | `Flask<2.3`, `Werkzeug<2.3` |

These bounds **preserve current behavior** and make `pip install` reproducible
to a working state, instead of resolving to an un-importable one.

## 3. Changes made (safe, behavior-preserving)

### `backend/requirements.txt`
- Added a header explaining the legacy-stack constraints.
- **Pinned ceilings** (reasoned above): `Flask<2.3`, `Werkzeug<2.3`,
  `Flask-WTF<1.0`, `WTForms<3.0`, `connexion[swagger-ui]<3.0`.
- **Removed `swaggerpy`** — Python-2-only, unused (no import anywhere), and not
  installable on Python 3; its presence breaks `pip install -r requirements.txt`.
- **Replaced `python-coveralls` → `coveralls`** — `python-coveralls` is abandoned
  and incompatible with modern `coverage`; `coveralls` is the maintained client.

### `backend/setup.py`
- `python_requires`: `>=3.6` → `>=3.8` (3.6/3.7 are EOL).
- Mirrored the critical ceilings (`flask<2.3`, `werkzeug<2.3`, `Flask-WTF<1.0`,
  `wtforms<3.0`, `connexion[swagger-ui]<3.0`) so `setup.py install` cannot pull
  breaking majors either.

### `.pre-commit-config.yaml`
- `git://github.com/...` → `https://github.com/...` (the `git://` protocol was
  permanently disabled by GitHub — the hooks could not install at all).
- Added the required top-level `repos:` key (old flat list format is removed in
  modern pre-commit).
- Bumped `pre-commit-hooks` `v2.2.3` → `v4.6.0`.
- Moved `flake8` to its own repo `https://github.com/pycqa/flake8` (it was
  removed from `pre-commit-hooks` in v3) pinned at `7.1.0`.

### `.github/workflows/prototype-tests.yml` (new)
- GitHub Actions workflow that installs and runs the curation-assistant
  prototype test suite on Python 3.11 — a working, green replacement for the
  defunct Travis pipeline.

### Documentation
- Root `README.md`: added a **Development setup** section (supported Python/Node
  versions, per-component install/run/test commands).
- This report.

## 4. Verification

> Preliminary (at commit time). A full clean-environment run was performed
> afterwards — see **Section 10. Verification Results**.

| Component | Result |
| --- | --- |
| Prototype (`prototypes/curation_assistant`) | **130 passed** (`pytest`) on Python 3.11 — unaffected by these changes |
| Backend (`nose2`) | **Not run here** — requires MongoDB + the legacy stack installed; the dependency edits are static (no code touched), so runtime behavior is unchanged |
| Frontend (`jest`) | **Not run here** — Node/npm/yarn unavailable |
| pre-commit | Config corrected by inspection; not executed (no network/install in this env) |

No application source files were modified, so no behavioral regressions are
introduced by these changes.

## 5. Remaining outdated packages (documented, not changed)

### Backend — recommended removals (declared but **not imported** anywhere)
Removing these reduces install friction / attack surface, but is left for a
reviewer who can run the backend test suite:
`Flask-API` (abandoned 2019), `flask-profiler` (abandoned), `Flask-HTTPAuth`,
`py3dns`, `pyasn1`, `validate-email`, `paramiko`, `schedule`, `expiringdict`.

### Backend — major upgrades requiring code changes (architectural)
- **Flask 2.2 → 3.x** + **Werkzeug 3.x**: needs replacing `flask-mongoengine`
  (unmaintained) — e.g. with `Flask-MongoEngine`'s successor or plain
  `mongoengine` + a small init shim.
- **WTForms 2 → 3** + **Flask-WTF 1.x**: replace `wtforms.fields.html5` imports
  with the merged `wtforms.fields` (`EmailField`, `IntegerField`).
- **connexion 2 → 3**: full rewrite (ASGI, new App API, `jsonifier` gone) —
  affects `project/__init__.py`, `project/api.py`, `project/db.py`.
- **jsonschema**: `Draft4Validator` still exists in 4.x; consider moving to
  `Draft7Validator` to match `backend/project/schema.json` ($schema: draft-07).

### Frontend — major upgrades (architectural; Node toolchain unavailable here)
- **Next.js 9.4 → 14/15**: large migration (routing, build, config).
- **React 16.13 → 18**: concurrent renderer; affects `react-dom` render API.
- **Material-UI**: currently a broken mix of `@material-ui/core@5.0.0-alpha` with
  `@material-ui/icons@4` / `@material-ui/lab@4-alpha`. v5 stable renamed packages
  to `@mui/material`, `@mui/icons-material`, `@mui/lab` with new imports/theming.
- **axios 0.19 → 1.x**: 0.19 has known CVEs; minor API/default differences.
- **enzyme + enzyme-adapter-react-16**: enzyme is abandoned with no React 17/18
  adapter; migrate tests to React Testing Library.
- **`simple-react-lightbox`**: deprecated/unpublished upstream; needs replacement.

### Infrastructure
- **Dockerfiles**: `python:3.6-alpine` is EOL. Recommend `python:3.10-slim`
  (Debian-slim avoids the musl/alpine pain with `lxml`/`cryptography` wheels).
  Not changed here because the image build can't be validated in this env.
- **`docker-compose.dev.yml`**: `mongo:3.6.18-xenial` is EOL → recommend
  `mongo:6.0`. Verify `mongoengine`/`pymongo` versions support the server.
- **`.travis.yml`**: defunct — recommend deleting once GitHub Actions covers
  backend + frontend (kept for now to preserve history).

## 6. Packages intentionally left unchanged

- The entire **Flask 2.x / WTForms 2.x / connexion 2.x** runtime generation —
  capped, not upgraded, because upgrading is a code migration (Section 5) and is
  out of scope for "modernize the environment without changing behavior".
- All **frontend** dependencies — no Node toolchain to install/build/test, and
  every meaningful bump is architectural.
- `mongoengine`, `pymongo`, `lxml`, `gunicorn`, `requests-oauthlib`, `jsonschema`
  — left unpinned (no known breaking interaction with the capped Flask stack);
  pinning is recommended once a full install can be validated (Section 7).

## 7. Compatibility risks

- **Unverified install**: the backend ceilings are reasoned from source usage but
  were not installed/run in this environment. Validate with a real
  `pip install -r backend/requirements.txt` on Python 3.10 before release.
- **flask-mongoengine is unmaintained**: it is the main blocker for any Flask 3.x
  move and a long-term liability.
- **Transitive resolution**: with only ceilings (no full lock), pip may still
  pick differing patch/minor versions across machines. A future lockfile
  (`pip-tools` / `pip freeze`) would close this gap.
- **Frontend MUI mix** is already internally inconsistent and may fail a clean
  `npm install`; treat the frontend as needing a dedicated upgrade pass.

## 8. Recommended future upgrades (priority order)

1. **Generate backend lockfiles** (`pip-tools`) on Python 3.10 to make the capped
   stack fully reproducible; pin `mongoengine`/`pymongo`/`lxml`.
2. **Migrate CI fully to GitHub Actions**: add a backend job with a `mongo:6.0`
   service + `nose2`, and a frontend job once Node is upgraded; delete `.travis.yml`.
3. **Bump Docker base images** to `python:3.10-slim` and `mongo:6.0`; verify builds.
4. **Backend framework migration** (large): connexion 2→3, Flask 2→3 +
   replace `flask-mongoengine`, WTForms 2→3 — unlocks a supported stack.
5. **Frontend migration** (large): Next 9→14, React 16→18, MUI→`@mui` v5,
   axios→1.x, enzyme→React Testing Library.
6. **Remove the unused backend dependencies** listed in Section 5 after the
   backend suite can be run green.

## 9. Recommended runtime versions

| Component | Current | Recommended now | Target after migration |
| --- | --- | --- | --- |
| Python (backend) | 3.6 | **3.10** (legacy stack validated 3.8–3.10) | 3.12 |
| Python (prototype) | 3.11 | **3.11** | 3.12 |
| Node.js (frontend) | unspecified (Next 9 needs ~12–14) | **14** for the current code | **20 LTS** after Next upgrade |
| MongoDB | 3.6 | **6.0** | 7.0 |

## 10. Verification Results (clean-environment run)

Follow-up verification performed after the modernization commits. Supersedes the
preliminary note in Section 4.

### Environment used
- **Python (requested 3.10):** only a **MSYS2/UCRT `Python 3.10.11`** is present
  (no standard CPython 3.10). Used to create a clean venv for the 3.10 attempt.
- **Python (substitute):** **standard CPython `3.11.5`** (clean venv) — the only
  standard interpreter with matching PyPI wheels; used to complete the install
  and the boot/test checks.
- **Node / npm / yarn:** **not installed** (`node`/`npm`/`yarn` → "not recognized").
  Frontend has `yarn.lock` only (no `package-lock.json`).

### 1. Backend install on Python 3.10 — ❌ FAILED (environment, not deps)
`pip install -r backend/requirements.txt` (and even `--dry-run`) fails while
building a transitive native dependency:
```
Building wheel for rpds-py ... error
Python reports SOABI: cpython-310
Unsupported platform: 310
Rust not found, installing into a temporary directory
ERROR: Failed to build 'rpds-py' (build dep of jsonschema→referencing)
```
**Cause:** the only available 3.10 is the MSYS2/UCRT build, for which PyPI ships
no matching wheels (platform tag `310`), so native packages
(`rpds-py`, `lxml`, `cryptography`, `cffi`) fall back to source builds that need
toolchains (Rust, libxml2) absent here. This is an interpreter/platform
limitation, **not** a dependency-cap problem.

### 2. Backend install on clean CPython 3.11 — ✅ PASS
- `pip install --dry-run -r requirements.txt` → **resolved, exit 0**.
- `pip install -r requirements.txt` → **exit 0** after a small env-only fix:
  the first attempt failed with a Windows **MAX_PATH (260-char)** `OSError`
  unpacking a deeply-nested `nose2` test file under the long scratchpad path;
  recreating the venv at a short path (`C:\Users\hongs\qv311`) resolved it.
- **Caps held exactly:** `Flask 2.2.5`, `Werkzeug 2.2.3`, `Flask-WTF 0.15.1`,
  `WTForms 2.3.3`, `connexion 2.14.2`, `flask-mongoengine 1.0.0`. `swaggerpy`
  and `python-coveralls` are **absent**; `coveralls 4.1.0` present. Unpinned
  natives drifted to `mongoengine 0.29.3`, `pymongo 4.17.0`, `jsonschema 4.26.0`,
  `lxml 6.1.1` (see test failure below).

### 3. `python -m pip check` — ✅ PASS
```
No broken requirements found.
```

### 4. Backend import / boot smoke — ✅ PASS
- `python -c "import project"` → **OK**; `project.app` constructed.
- Flask test client `GET /` → **HTTP 200** (no MongoDB needed for the index route).
The app imports and boots on the capped stack.

### 5. Backend tests (`nose2`) — ❌ FAILED (17 errors; dependency drift, not Mongo)
All 17 `test_paperDAO` tests error in `setUp`, before reaching any DB assertion:
```
File "project/tests/test_paperDAO.py", line 21, in setUp
  MongoDBConnection.getDB(hostname='mongomock://localhost', ...)
...
File ".../mongoengine/connection.py", line 120, in _get_connection_settings
  raise Exception(
Exception: Use of mongomock:// URI or 'is_mock' were removed in favor of
'mongo_client_class=mongomock.MongoClient'. Check the CHANGELOG for more info
```
**Cause:** the tests use the in-memory `mongomock://localhost` URI, but
**`mongoengine` ≥ 0.27 removed `mongomock://` URI support** (resolved here to
`0.29.3` because `mongoengine` is unpinned). This is a real, pre-existing
compatibility regression from dependency drift — **independent of these
modernization commits** (mongoengine was unpinned before and after) and **not** a
"missing MongoDB" problem (the tests never intended a real server).

### 6. Frontend install / build / test — ✅ VERIFIED (Node 14 + Yarn classic)
Initially not run (no toolchain in the CI sandbox), later **verified manually on
Windows** with **Node v14.21.3 / npm 6.14.18 / Yarn 1.22.22**. From `frontend/`:

| Command | Result |
| --- | --- |
| `yarn install` | ✅ passed |
| `yarn build` (`next build`) | ✅ passed |
| `yarn test` (jest) | ✅ passed — **2 suites, 7 tests** |

The committed `yarn.lock` (v1; no `package-lock.json`) installed **with no
changes**, so it is kept as-is and is reproducible. No frontend manifest or
behavior changes were made. Use **Node 14** (matches `frontend/Dockerfile`
`node:14.5-alpine3.12`); Node 18/20 would require upgrading Next first
(architectural — Section 5). See `TROUBLESHOOTING.md` §7–§8.

### 7. Docker / Compose — ✅ VERIFIED with DB-backed runtime (see §13 build repairs, §14 DB runtime)
Docker is installed and working: **Docker 29.6.1 / Compose v5.1.4**, context
`desktop-linux`; `docker run --rm hello-world` passes. (Supersedes the earlier
"not installed" note.) Before-repair results:

| Step | Result |
| --- | --- |
| `docker compose config` (default) | ✅ pass (`gui`,`backend`,`nginx`) |
| `docker compose -f docker-compose.yml.services config` | ✅ pass (`mongodb`,`web`,`nginx`) — **legacy** file (builds `./web`, which no longer exists) |
| `build backend` | ✅ pass (`python:3.6-alpine`; uses `requirements.txt`, not the lock → versions differ from the 3.11 baseline) |
| `build gui` | ❌ `yarn global add pm2` pulls `pidusage@4` requiring Node ≥18 on a Node 14 base |
| `build nginx` | ❌ missing `localhost.crt` / `localhost.key` |
| `docker-compose.dev.yml config` | ❌ duplicate `environment` key in `backend` |
| `up --build` | ⛔ blocked by gui + nginx |

Minimal repairs and after-results are in **Section 13**. Full classification is in
`TROUBLESHOOTING.md` §9.

### Exact error summaries
| Check | Result | Exact error / note |
| --- | --- | --- |
| 3.10 install | FAIL | `Unsupported platform: 310` / `Rust not found` building `rpds-py` (MSYS2/UCRT, no wheels) |
| 3.11 dry-run resolve | PASS | exit 0; caps honored |
| 3.11 install | PASS | exit 0 (after moving venv off long path; Windows MAX_PATH `OSError` on `nose2` file) |
| pip check | PASS | `No broken requirements found.` |
| import / boot | PASS | `import project` OK; `GET / → 200` |
| nose2 | FAIL (17 errors) | `Use of mongomock:// URI ... were removed` (mongoengine 0.29.3) — **fixed** in §11 via the `mongoengine<0.27` / `pymongo<4` pins (now 17 OK) |
| frontend | PASS | Node 14.21.3 / Yarn 1.22.22: `yarn install` / `build` / `test` OK (jest 2 suites, 7 tests) |
| docker | ✅ VERIFIED (DB-backed) | 29.6.1/Compose v5.1.4; all 4 services up incl. `mongodb`; `/api/*` reads/writes Mongo; backend on py3.11-slim+lock (§13 builds, §14 DB runtime) |

### Recommended next steps (from verification)
1. **Fix backend tests via a dependency pin** (smallest, behavior-preserving):
   add `mongoengine<0.27` to restore `mongomock://` URI support — or update
   `project/tests/test_paperDAO.py` `setUp` to
   `mongo_client_class=mongomock.MongoClient` (test-only code change). Deferred
   here because this task is verification-only and it is not an install blocker.
2. **Pin the unpinned natives** (`mongoengine`, `pymongo`, `jsonschema`, `lxml`)
   via a lockfile so drift cannot silently break tests again.
3. **Validate the full stack on standard CPython 3.10** (Linux/Windows with
   wheels), e.g. the GitHub Actions runner, rather than the MSYS2 interpreter.
4. **Provide a Node toolchain** (Node 14 for the current Next 9 code) to verify
   `yarn install` / `yarn build`, or defer until the frontend upgrade pass.
5. Enable Windows long-path support (or use short build paths) for local Windows
   installs of packages with deep test trees.

## 11. Stable Baseline (summer handoff)

After the verification above, the backend was **stabilized and pinned** so it can
be reproduced from a clean checkout. This supersedes the "leave unpinned"
posture in earlier sections for the four packages involved.

### Why stabilize instead of migrate
This was a ~two-month effort that may go unmaintained for a while. The backend
source is coupled to a specific stack generation (`wtforms.fields.html5`,
`connexion.jsonifier`, the `mongomock://` URI). Forcing latest majors (Flask 3,
connexion 3, WTForms 3, MongoEngine ≥0.27) would require source rewrites and
risk leaving a **broken app with no maintainer**. The handoff value is in a
**reproducible, test-green baseline**, so we pin the known-good versions and
document — but do not perform — the migrations.

### Pins applied (this task)
| Package | Pin | Reason |
| --- | --- | --- |
| `mongoengine` | `<0.27` | 0.27 removed the `mongomock://` URI used by the tests |
| `pymongo` | `<4` | mongoengine 0.26 imports `pymongo.database._check_name` (gone in 4.0) |

(These join the earlier caps: `Flask<2.3`, `Werkzeug<2.3`, `Flask-WTF<1.0`,
`WTForms<3.0`, `connexion[swagger-ui]<3.0`.)

### Reproducibility strategy
- `backend/requirements.txt` — human-maintained, loosely pinned with rationale.
- `backend/requirements.lock.txt` — **new**: exact `pip freeze` of the verified
  set (`pip install -r requirements.lock.txt` for an exact reproduction).
- Regenerate the lock after editing `requirements.txt`:
  ```bash
  python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
  pip install -r requirements.txt
  pip freeze | grep -v "^pip==" > requirements.lock.txt
  ```

### Verified baseline (re-run with the pins, clean CPython 3.11.5 venv)
| Check | Result |
| --- | --- |
| `pip install -r requirements.txt` | ✅ exit 0 |
| `pip install -r requirements.lock.txt` | ✅ exit 0 (exact set) |
| `python -m pip check` | ✅ `No broken requirements found.` |
| `import project` + `GET /` | ✅ HTTP 200 |
| `python -m nose2` | ✅ **Ran 17 tests … OK** (mongomock; no MongoDB) |

Key versions: `Flask 2.2.5`, `Werkzeug 2.2.3`, `Flask-WTF 0.15.1`,
`WTForms 2.3.3`, `connexion 2.14.2`, `flask-mongoengine 1.0.0`,
`mongoengine 0.26.0`, `pymongo 3.13.0`, `mongomock 4.3.0`, `jsonschema 4.26.0`,
`lxml 6.1.1`. Full set in `backend/requirements.lock.txt`.

### Later also verified
- **Frontend** — `yarn install`/`build`/`test` on Node 14.21.3 (Section 10 item 6).
- **Docker** — builds + full stack bring-up after minimal repairs (Section 13).

### Still unverified (documented)
Real MongoDB-backed flows (the default compose has no `db` service), and non-3.11
Python for the backend.

## 12. Future Migration Roadmap (documented, NOT implemented)

For a future maintainer who picks the project back up. Each item is intentionally
deferred to keep the summer baseline stable.

| Migration | Effort | Notes / blockers |
| --- | --- | --- |
| **MongoEngine ≥0.27 + PyMongo 4** | Small–Med | Update `project/tests/test_paperDAO.py` `setUp` to `mongo_client_class=mongomock.MongoClient`; re-test DAO queries; then unpin `mongoengine`/`pymongo`. |
| **connexion 2 → 3** | Large | Full rewrite (ASGI, new `App` API, `jsonifier` removed). Affects `project/__init__.py`, `project/api.py`, `project/db.py`. |
| **Flask 2 → 3 / Werkzeug 3** | Large | Requires replacing the unmaintained `flask-mongoengine` (main blocker) and revalidating `Flask-Session`/`flask-sitemap`. |
| **WTForms 2 → 3 / Flask-WTF 1.x** | Small–Med | Replace `wtforms.fields.html5` imports with the merged `wtforms.fields` (`EmailField`, `IntegerField`) in `project/views.py`. |
| **Frontend: Next 9→14, React 16→18, MUI→@mui v5, axios 0→1, enzyme→RTL** | Large | Architectural; the `@material-ui/*` versions are already internally inconsistent. Do as one dedicated pass; upgrade Node 14→20 LTS with it. |
| **Docker base modernization** | Med | `python:3.6-alpine` → `python:3.10-slim`; install via `requirements.lock.txt`; fix dev-compose host-path coupling (TROUBLESHOOTING §9). |
| **MongoDB modernization** | Small | `mongo:3.6` → `6.0`; verify `mongoengine`/`pymongo` versions support the server (couple with the MongoEngine migration above). |
| **Remove unused backend deps** | Small | `Flask-API`, `flask-profiler`, `Flask-HTTPAuth`, `py3dns`, `pyasn1`, `validate-email`, `paramiko`, `schedule`, `expiringdict` are declared but not imported (Section 5). |

**Suggested order:** MongoEngine/PyMongo → MongoDB image → Docker base → WTForms
→ (later) connexion/Flask → (separate effort) frontend.

## 13. Docker — Minimal Repairs & After-Results

Environment: **Docker 29.6.1 / Compose v5.1.4** (Docker Desktop, `desktop-linux`).
Goal: make the existing default stack build and run locally **without** any
framework/dependency migration. Three minimal, Docker-only fixes:

| # | Fix | File(s) | Why it is safe |
| --- | --- | --- | --- |
| A | Node base `14.5-alpine3.12` → **`14.21.3-alpine`**, and pin **`pm2@5.4.3`** (was unpinned) | `frontend/Dockerfile`, `frontend/Dockerfile.dev` | Stays on Node 14 (matches the verified local toolchain); pinning stops `pm2` pulling `pidusage@4` (needs Node ≥18). **Frontend app deps unchanged.** |
| B | Generate **self-signed dev TLS certs** via a script; **no Dockerfile cert change for prod behavior**, no committed keys | `nginx/generate-local-certs.sh` (new) | `*.crt`/`*.key` are already git-ignored; prod still supplies real certs. |
| B′ | Align prod nginx Dockerfile cert names `localhost.*` → **`nginx.*`** to match its own `default.conf` (`ssl_certificate /etc/certs/nginx.crt`) | `nginx/Dockerfile` | Pre-existing internal mismatch (build copied `localhost.*`, config required `nginx.*`); aligning is a correctness fix, no keys committed. |
| C | Merge the **duplicate `environment`** key in the `backend` service | `docker-compose.dev.yml` | Pure YAML fix; preserves all three vars (`PYTHONUNBUFFERED`, `FLASK_APP`, `FLASK_ENV`). |

### After-results (verified)
| Command | Before | After |
| --- | --- | --- |
| `docker compose config` / `--services` | ✅ | ✅ (`backend`,`gui`,`nginx`) |
| `docker compose build backend` | ✅ | ✅ `qresp-backend` |
| `docker compose build nginx` | ❌ missing certs | ✅ `qresp-nginx` |
| `docker compose build gui` | ❌ pm2/pidusage | ✅ `qresp-gui` (`next build` OK) |
| `docker compose -f docker-compose.dev.yml config --services` | ❌ duplicate `environment` | ✅ (`db`,`gui`,`backend`,`nginx`) |
| `docker compose up --build` | ⛔ | ✅ all 3 Up; `http://localhost`→**301**, `https://localhost/`→**200**, `/api/*` reaches backend |

`docker compose down` cleans up; no leftover containers.

### Remaining Docker blockers / risks (documented, not in scope here)
- **No `db` service in the default compose** → DB-backed routes (publish/search/
  paper details) won't fully work; the stack serves the SPA + non-DB routes. The
  `mongodb` service exists only in the **legacy** `docker-compose.yml.services`
  (which builds a non-existent `./web` context — see below).
- **`docker-compose.dev.yml` still needs host paths** `~/Repositories/MongoDB/...`
  (`env_file`/volumes); `config` passes the YAML stage now but fails resolving
  the missing `env_file`. Left as-is (changing it is beyond a minimal fix).
- **Backend image still uses `python:3.6-alpine`** and installs `requirements.txt`
  (not the lock), so its dependency versions differ from the verified 3.11
  baseline. Base-image modernization is deferred (Section 12).
- **`version:` key** in `docker-compose.yml` is obsolete (warning only; left as-is).

### `docker-compose.yml.services` — legacy
Builds `./web` (a directory removed when the repo split into `backend/` +
`frontend/`) and uses the removed `mongod --smallfiles` flag. `config` passes but
it will not build. **Recommendation:** treat as historical reference / future
work; do **not** merge into the default compose now. Its useful idea — a
self-contained `mongodb` service — should be folded into the default compose as
part of the deferred MongoDB/Docker modernization (Section 12).

## 14. Docker — DB-backed Runtime (branch `fix/docker-db-runtime`)

Continuation of Section 13. Goal: make the Docker stack support **DB-backed**
Qresp runtime. **Final status: Docker fully verified with DB-backed runtime.**
Environment: Docker 29.6.1 / Compose v5.1.4 (Docker Desktop, WSL2).

### Changes
| Stage | Change | File(s) |
| --- | --- | --- |
| 1 | Add a **`mongodb`** service (`mongo:4.4`) + named volume `qresp_mongo_data`; wire backend to it | `docker-compose.yml` |
| 1 | Env-var override in config loader so Docker injects Mongo settings without editing `config.ini` (`QRESP_MONGODB_HOST` etc.); **no local behavior change** when unset | `backend/project/config.py` |
| 2 | Replace dev compose hard-coded `~/Repositories/MongoDB/...` `env_file`/volumes with a named volume; wire dev backend to the `db` service; drop obsolete `version:` | `docker-compose.dev.yml` |
| 3+4 | Backend base `python:3.6-alpine` → **`python:3.11-slim`** and install from **`requirements.lock.txt`** (matches the verified local baseline; slim has wheels so no apt build toolchain) | `backend/Dockerfile` |

> The only application-side change is the **config loader** (`config.py`): a
> `QRESP_`-prefixed env override. No business logic, schema, routes, or models
> changed. `mongo:4.4` is chosen to match the backend driver (`pymongo 3.13`,
> pinned `<4`); pairing `mongo:6.0` with PyMongo 4 is part of the deferred
> migration (Section 12).

### Verified (commands run)
| Check | Result |
| --- | --- |
| `docker compose config` / `--services` | ✅ `mongodb, backend, gui, nginx` |
| `docker compose build backend` (py3.11-slim + lock) | ✅ (Python 3.11.15; wheels only) |
| backend boot in container (`GET /`) | ✅ 200 |
| `nose2` in container (mongo env cleared) | ✅ **Ran 17 tests OK** |
| `docker compose up --build` | ✅ all 4 services Up, no crash loops |
| `https://localhost/` (frontend via nginx) | ✅ 200 |
| `https://localhost/api/search` (empty DB) | ✅ 200 `[]` (DB connected — was `400` before) |
| DAO insert + `/api/search` read-back | ✅ inserted paper returned (title "Photoelectron Spectra of Aqueous Solutions…"), `/api/collections` → `["MICCOM"]` |
| named volume persistence across rebuild | ✅ Stage-1 data survived the base-image change |
| `docker compose -f docker-compose.dev.yml config --services` | ✅ `db, gui, backend, nginx` (host-path error gone) |
| `docker compose -f docker-compose.dev.yml up --build` | ✅ all 4 Up; flask on :5000; `/api/search` → 200 |

### Status of earlier blockers
- **MongoDB runtime** — ✅ now verified (default + dev compose).
- **Dev compose hard-coded paths** — ✅ removed (named volume).
- **Backend Docker Python** — ✅ upgraded to 3.11-slim (no longer EOL legacy).
- **Docker dependency reproducibility** — ✅ now installs `requirements.lock.txt`
  (was `requirements.txt`), so Docker matches the verified local baseline.

### Remaining risks / notes
- **No-auth dev Mongo:** the compose Mongo runs without authentication (fine for
  local/dev; production must enable auth + real credentials).
- **Running `nose2` inside the running compose** uses the real-Mongo env, which
  conflicts with the tests' `mongomock://` setup → run tests with the
  `QRESP_MONGODB_*` env cleared (see TROUBLESHOOTING §9). App runtime is unaffected.
- **TLS certs** are still locally generated/self-signed (git-ignored); production
  needs real certs.
- **`mongo:4.4`** is paired with the pinned `pymongo 3.13`; bump to `6.0` only
  alongside the PyMongo 4 / MongoEngine migration (Section 12).
- `docker-compose.yml.services` remains legacy (Section 13).
