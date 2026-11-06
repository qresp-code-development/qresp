# Qresp 2.0 — Summer Project Checklist

A concise status snapshot for handoff. Detail lives in
[the modernization report](../modernization/modernization-report.md),
[Quickstart](../../guides/quickstart.md), and [Troubleshooting](../../guides/troubleshooting.md).

Legend: ✅ done & verified · 🟡 done, not verified here · ⏸ deferred (by design)

---

## Completed work
- [x] AI-assisted **curation assistant prototype** (`prototypes/curation_assistant/`):
      ingest → file roles/versions → static read/write → PDF figures → candidate
      chains → Qresp metadata draft → human-readable summary.
- [x] Backend **dependency stabilization**: compatibility caps + removed broken
      `swaggerpy`, swapped `python-coveralls`→`coveralls`.
- [x] **MongoEngine/PyMongo pins** restoring legacy backend test behavior.
- [x] **Reproducible lock** (`backend/requirements.lock.txt`).
- [x] **pre-commit** config repaired (git:// → https://, modern hooks).
- [x] **GitHub Actions** CI: prototype tests + backend smoke (Travis retired).
- [x] Handoff docs: [Quickstart](../../guides/quickstart.md), [Troubleshooting](../../guides/troubleshooting.md),
      [modernization report](../modernization/modernization-report.md),
      VALIDATION (`prototypes/curation_assistant/`, not in the repository), this checklist,
      [published-record revision design](../design/published-record-revision.md).

## Verified work (run in a clean environment)
- [x] ✅ Prototype test suite — **130 passed** (CPython 3.11).
- [x] ✅ Backend install — `pip install -r requirements.txt` / `requirements.lock.txt` exit 0 (CPython 3.11.5).
- [x] ✅ `python -m pip check` — "No broken requirements found."
- [x] ✅ Backend import + boot — `import project`, `GET / → 200`.
- [x] ✅ Backend tests — `nose2` **17 tests OK** (in-process mongomock; no MongoDB needed).
- [x] ✅ **Frontend** install/build/test — `yarn install` / `yarn build` /
      `yarn test` all passed on **Node 14.21.3 + Yarn 1.22.22** (jest: 2 suites,
      7 tests). Committed `yarn.lock` unchanged.

- [x] ✅ **Docker — DB-backed runtime** (29.6.1 / Compose v5.1.4) — default
      compose now includes a `mongodb` service; `docker compose up --build` runs
      all 4 services; `https`→200; `/api/search` + `/api/paper/{id}` read/write
      Mongo (verified insert→read). Backend on `python:3.11-slim` +
      `requirements.lock.txt`. Dev compose host paths removed. See
      `modernization_report.md` §13–§14 / `TROUBLESHOOTING.md` §9.

## Partially verified / not yet run
- [x] 🟡 **DB-backed API** — `search`, `collections`, `paper/{id}` verified
      against Dockerized Mongo. **Publish flow** (email verification + Google
      OAuth) and the **browser explorer UI end-to-end** not exercised.
- [ ] 🟡 **Python 3.10** backend run — only an MSYS2/UCRT 3.10 (no wheels) was
      available; verified on standard CPython 3.11 instead.

## Deferred future work (intentionally not implemented)
- [ ] ⏸ MongoEngine ≥0.27 + PyMongo 4 migration (then unpin).
- [ ] ⏸ connexion 2→3, Flask 2→3 (+ replace unmaintained flask-mongoengine), WTForms 2→3.
- [ ] ⏸ Frontend: Next 9→14, React 16→18, Material-UI → `@mui` v5, axios 0→1, enzyme→RTL.
- [ ] ⏸ Docker base / MongoDB image modernization.
- [ ] ⏸ Remove unused backend deps (Flask-API, flask-profiler, etc.).
- [ ] ⏸ Curation assistant: tool detection, OCR, image-content similarity, LLM assistance.
- [ ] ⏸ Published-record **edit/delete** (design only — see [published-record revision design](../design/published-record-revision.md)).

## Known risks
- **Unmaintained upstreams**: `flask-mongoengine` (blocks Flask 3), `Flask-API`,
  `flask-profiler`, `enzyme`, `simple-react-lightbox`.
- **Pinned-by-necessity stack**: caps preserve behavior but accrue security debt;
  revisit with the migrations above.
- **Dependency drift** outside the lock can re-break tests (that is exactly what
  the MongoEngine/PyMongo pins fixed); keep `requirements.lock.txt` current.
- **Frontend builds only on Node 14** (verified); Node 18/20 needs a Next upgrade.
- **Docker dev TLS certs are self-signed/local** and the dev Mongo runs without
  auth — fine for local dev, not production.
- **One manual step for Docker**: run `sh nginx/generate-local-certs.sh` once
  before the first `docker compose build` (certs are git-ignored).

## Recommended next steps (priority order)
1. MongoEngine/PyMongo migration → unpin → align Docker `mongo:4.4` → `6.0`.
2. Production hardening of the Docker stack (real TLS certs, Mongo auth).
3. Validate the curation assistant on 1–2 real papers (see `VALIDATION.md`).
4. Keep both CI workflows green; regenerate the lock when `requirements.txt` changes.
