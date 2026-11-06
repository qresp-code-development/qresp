# Qresp
Official [Qresp](http://qresp.org) software repository. Current release: **v3.0.0** ([CHANGELOG](CHANGELOG.md)).

## About
**Qresp** "Curation and Exploration of Reproducible Scientific Papers" is a web application that facilitates the organization, annotation and exploration of data presented in scientific papers. Curators link the figures, datasets, scripts, tools and workflows of a research work to the files that produced them; readers can trace which code produced each result. Besides published papers, Qresp records unpublished papers and reports, code repositories, datasets and other works.

Reference: 

M. Govoni, M. Munakami, A. Tanikanti, J. H. Skone, H. B. Runesha, F. Giberti, J. de Pablo, and G. Galli, *Qresp, a tool for curating, discovering and exploring reproducible scientific papers*, Sci. Data 6, 190002 (2019). [https://doi.org/10.1038/sdata.2019.2](https://doi.org/10.1038/sdata.2019.2).

## Documentation
Project documentation is organized in [docs/README.md](docs/README.md).
Start with the [Quickstart](docs/guides/quickstart.md) or the
[RCC folder analysis guide](docs/curation/rcc-folder-analysis.md).
To run a production server, see [Production deployment](docs/operations/production-deploy.md).

## Development 
The **Qresp** development is hosted on [GitHub](https://github.com/qresp-code-development/qresp), and licensed under the open-source GPLv3 license. See [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), and [AUTHORS.md](AUTHORS.md) for more information.

## Local development setup

| Component | Version | Where it is pinned |
| --- | --- | --- |
| Python (backend) | **3.11** or **3.14** | CI matrix; the Docker image uses 3.14 |
| Backend stack | Flask 3.1, Connexion 3.3 (ASGI), MongoEngine 0.29, PyMongo 4.17 | `backend/requirements.lock.txt` |
| Node.js (frontend) | **24** | `frontend/Dockerfile` |
| Frontend stack | Next.js 16, React 19, MUI 9 | `frontend/package.json` |
| MongoDB | **4.4** (server 4.0 or newer required) | `docker-compose.yml` |

Step-by-step setup is in the [Quickstart](docs/guides/quickstart.md); known
problems are in [Troubleshooting](docs/guides/troubleshooting.md).

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.lock.txt
python -m nose2 -v          # in-memory mongomock; no MongoDB needed
```

### Frontend
```bash
cd frontend
yarn install
yarn dev          # http://localhost:3000
yarn test
yarn build
```

### Docker (full stack)
```bash
sh nginx/generate-local-certs.sh     # self-signed dev certs, git-ignored
docker compose -f docker-compose.dev.yml up --build
```
With the standalone Compose v1 (`docker-compose`, e.g. 1.22) use
`docker-compose -f docker-compose.dev.yml up --build`.

| File | Use |
| --- | --- |
| `docker-compose.dev.yml` | Development: frontend hot reload |
| `docker-compose.staging-full.yml` | Staging/QA: production build with dev sign-in |
| `docker-compose.yml` | Production: gunicorn + uvicorn workers; secrets in `.env.prod` |

### Continuous integration
GitHub Actions runs on every push: the backend suite on Python 3.11 and 3.14
([`.github/workflows/backend-smoke.yml`](.github/workflows/backend-smoke.yml))
and the frontend Jest suite
([`.github/workflows/frontend.yml`](.github/workflows/frontend.yml)).
