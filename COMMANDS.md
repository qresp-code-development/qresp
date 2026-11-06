# Qresp — Command Reference

## Git

```bash
# Pull latest changes
git pull origin develop

# Push to GitHub (the Stop hook does this automatically after Claude commits)
git push origin develop

# Check what's staged / unstaged
git status

# Compact recent history
git log --oneline -15

# Create a short-lived feature branch (for large isolated features only)
git checkout -b feat/my-feature

# Merge feature branch back and delete it when done
git checkout develop && git merge feat/my-feature
git push origin develop
git branch -d feat/my-feature && git push origin --delete feat/my-feature
```

---

## First-time setup (fresh clone)

```bash
# 1. Create .env.dev from the committed template, then fill in real credentials
cp .env.dev.example .env.dev
# Edit .env.dev and set QRESP_FLASK_SECRET_KEY, QRESP_GOOGLE_CLIENT_ID,
# QRESP_GOOGLE_CLIENT_SECRET, QRESP_GOOGLE_REDIRECT_URI.
# The docker-compose.dev.yml backend service will fail to start without this file.

# 2. Generate self-signed TLS certs (only needed once)
sh nginx/generate-local-certs.sh
```

---

## Docker (dev — use this day-to-day)

```bash
# Start (or rebuild) dev stack — accessible at https://localhost:8444
# NOTE: backend Python/YAML changes require a restart (no hot-reload on this kernel)
sudo docker-compose -f docker-compose.dev.yml up --build -d

# Stop dev stack
docker-compose -f docker-compose.dev.yml down

# View live logs from all services
docker-compose -f docker-compose.dev.yml logs -f

# Logs from a single service
docker-compose -f docker-compose.dev.yml logs -f backend
docker-compose -f docker-compose.dev.yml logs -f gui
docker-compose -f docker-compose.dev.yml logs -f nginx

# Restart a single service without rebuilding
docker-compose -f docker-compose.dev.yml restart backend

# Rebuild and restart only one service
docker-compose -f docker-compose.dev.yml up --build -d backend
```

## Docker (staging — production build, use to QA before merging)

```bash
# Start staging stack — accessible at https://localhost:8444
docker-compose -f docker-compose.staging-full.yml up --build -d

# Stop staging stack
docker-compose -f docker-compose.staging-full.yml down
```

## Docker — housekeeping

```bash
# List running containers
docker ps

# Stop ALL running containers
docker stop $(docker ps -q)

# Remove stopped containers and dangling images (safe cleanup)
docker system prune

# Nuclear option: remove everything including volumes (DESTROYS local DB data)
docker system prune -a --volumes
```

---

## SSH port forwarding (access the dev server from your local machine)

```bash
# Forward staging ports — paste this in a local terminal, then open https://localhost:8444
ssh -L 8444:localhost:8444 -L 8081:localhost:8081 samuel@<server-ip>

# Keep the tunnel alive in the background
ssh -fNL 8444:localhost:8444 samuel@<server-ip>
```

If you're already on the server (VS Code Remote SSH), the ports are forwarded automatically in the VS Code Ports panel.

---

## CI checks (run automatically on every push)

| Check | What it runs | Why two backend checks? |
|---|---|---|
| `backend / Python 3.11` | Flask API, auth, CRUD, publish, curation — 29 critical test modules | 3.11 = local dev baseline (lock file provenance) |
| `backend / Python 3.14` | Same suite on the Docker production Python | 3.14 = what the container actually runs |
| `frontend / Jest / RTL` | ~60 React component and utility tests | Node 24, matches the frontend Dockerfile |

Running backend tests on both Python versions catches subtle breakage that only shows up in the production container. Both versions run in parallel so wall-clock time is no longer than running one.

**What the backend suite covers:** public API routes, auth (Google OAuth + Microsoft Entra), paper CRUD, search/filter, publish workflow, verify, schema validation, curation (folder analysis, artifact fields, keyword AI, RCC images), draft management, ownership/permissions, editor roles, soft-delete, account management.

**What is intentionally skipped on push** (too slow or not critical-path):
- Evaluation benchmarks: `test_ai_review`, `test_assist_eval`, `test_related_eval`
- Related-research subsystem: `test_related_research`, `test_related_cache`, `test_related_hardening`
- Algorithm detail tests: `test_relatedness_quality/neutrality/provenance`
- Infrastructure: `test_nginx_config`, `test_backfill_institution`, `test_federation`

---

## Tests (local)

```bash
# Backend — run only the same critical-path set CI runs
cd backend && python -m nose2 -v \
  project.tests.test_api_endpoints project.tests.test_auth \
  project.tests.test_permissions project.tests.test_paperDAO \
  project.tests.test_publish_validation project.tests.test_verify \
  project.tests.test_dependencies project.tests.test_workflow_graph

# Backend — run the full suite (slow, ~5–6 min)
cd backend && python -m nose2 -v

# Frontend tests
cd frontend && yarn test

# Frontend tests — watch mode
cd frontend && yarn test:watch

# Frontend — single test file
cd frontend && yarn test __tests__/MyTest.spec.js
```

---

## First-time setup

```bash
# Generate self-signed TLS certs (one time only)
sh nginx/generate-local-certs.sh

# Install frontend deps
cd frontend && yarn install

# Install backend deps
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.lock.txt
```

---

## Useful one-liners

```bash
# Open a shell inside the running backend container
docker exec -it qresp_staging_backend_1 bash

# Open a shell inside the running frontend container
docker exec -it qresp_staging_gui_1 sh

# Connect to MongoDB directly
docker exec -it qresp_staging_mongodb_1 mongo explorer

# Check nginx config for syntax errors
docker exec qresp_staging_nginx_1 nginx -t

# Watch nginx access logs
docker exec -it qresp_staging_nginx_1 tail -f /var/log/nginx/access.log

# Tail backend Python logs
docker-compose -f docker-compose.dev.yml logs -f --tail=50 backend
```
