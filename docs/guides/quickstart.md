# Qresp Quickstart

From a clean checkout to a running backend, frontend and test suite.
Known problems and their fixes are in [Troubleshooting](troubleshooting.md).

## Versions

| Item | Version |
| --- | --- |
| Backend Python | **3.11** or **3.14** (the two CI runs; Docker uses 3.14). Use a standard CPython build. |
| Backend stack | Flask 3, Connexion 3 (ASGI), MongoEngine 0.29, PyMongo 4 — exact set in `backend/requirements.lock.txt` |
| Node.js | **24** (matches `frontend/Dockerfile`), with Yarn 1 |
| Frontend stack | Next.js 16, React 19, MUI 9, Jest 30 |
| MongoDB | **4.4** for the live app (`docker-compose.yml`). The tests do not need it. |

## Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate

pip install -r requirements.lock.txt # the exact versions CI installs
python -m pip check

# Boot smoke test (no MongoDB needed for the API health endpoint)
python -c "import project; print(project.connexionapp.test_client().get('/api/healthz').status_code)"   # 200

# Tests: in-memory mongomock, no MongoDB needed
python -m nose2 -v
```

`requirements.txt` lists the direct dependencies; `requirements.lock.txt` pins
the whole tree. Install from the lock file unless you are deliberately
upgrading.

### Running the live app

The live app needs a real MongoDB. Start one (for example a local `mongo:4.4`
container), then:

```bash
python -m uvicorn project:connexionapp --host 0.0.0.0 --port 5000 --reload
```

Serve `project:connexionapp`, not `project:app`: Connexion 3 is ASGI, and the
bare Flask app would bypass its request validation and Swagger UI. Connection
settings are in `backend/project/config.ini`; each can be overridden by a
`QRESP_*` environment variable (see `backend/project/config.py`).

## Frontend

```bash
cd frontend
yarn install         # uses the committed yarn.lock
yarn dev             # http://localhost:3000
yarn test            # Jest
yarn build           # production build
```

The browser calls the API at `NEXT_PUBLIC_API_URL` (the backend's origin, for
example `http://localhost:5000`). Server-side rendering inside Docker reaches
the backend through `QRESP_INTERNAL_API_URL` instead; see
`frontend/Utils/serverSideApi.js`.

## Docker (full stack)

```bash
sh nginx/generate-local-certs.sh     # self-signed dev certs, git-ignored
docker compose -f docker-compose.dev.yml up --build
```

With the standalone Compose v1 (`docker-compose` 1.22, as on paperstack)
use `docker-compose -f docker-compose.dev.yml up --build`.

This starts MongoDB, the backend, the frontend and nginx. nginx sends `/api`
to the backend and everything else to the frontend.

## Further reading

- [RCC folder analysis](../curation/rcc-folder-analysis.md)
- [Microsoft Entra sign-in setup](../operations/microsoft-entra-login.md)
- [Staging QA](../operations/staging-qa.md)
- [Production deployment](../operations/production-deploy.md)
- [Documentation index](../README.md)
