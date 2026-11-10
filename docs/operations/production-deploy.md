# Production deployment (paperstack.uchicago.edu)

How to deploy a Qresp release to the UChicago production server, and how the
v3.0.0 cutover from the 2021 install works. Coordinate the maintenance window
with the site admin first.

## Server facts

| Item | Value |
| --- | --- |
| Host | `paperstack.uchicago.edu` (UChicago VPN required for SSH) |
| Docker / Compose | Docker 18.06, standalone `docker-compose` 1.22 (hyphenated) |
| Pre-3.0 install | `/home/sushant/qresp` (v2.0.5, `master`), data in the host MongoDB **3.6.7** (`/etc/mongod.conf`, port 27017, auth on, user `qresp_admin`, db `explorer`) |
| 3.0 install | `/home/sushant/qresp_v2`, data in the compose `mongodb` service (`mongo:4.4`, volume `qresp_v2_qresp_mongo_data`) |
| Staging | `/home/samuel/qresp_staging`, ports 8444/8081 |

Why the data moves: PyMongo 4.17 cannot talk to a MongoDB 3.6 server, so the
3.0 backend cannot use the host database. The dump is restored into the
`mongo:4.4` container; the host database is left untouched as the rollback.

`docker-compose.yml` is written for this server: `version: "2.4"` (Compose
1.22 needs a version key; `pids_limit` needs the 2.x format), and the backend
runs with `seccomp:unconfined` and `pids_limit: -1`. Without those two the
backend fails with `RuntimeError: can't start new thread` on Docker 18.06.

## 1. Release on GitHub

1. CI green on `develop`.
2. PR `develop` → `master` in `qresp-code-development/qresp`, merge.
3. Release `vX.Y.Z` tagged on `master`.

## 2. Prepare (site stays up)

**Disk.** Builds need several GB:
```bash
df -h /
sudo docker system df
sudo docker image prune        # untagged images only
```

**Back up.**
```bash
mkdir -p ~/qresp-backups && cd ~/qresp-backups
sudo tar czf qresp-live-code-$(date +%F).tgz --exclude=backend/flask_session -C /home/sushant qresp
mongodump --host 127.0.0.1 --port 27017 -u qresp_admin -p --authenticationDatabase admin \
  --db explorer --out explorer-$(date +%F)
```
(Use `--authenticationDatabase explorer` if `admin` is rejected.)

**Rehearse on staging with the real data.** Separate compose project, so the
normal staging database is not touched:
```bash
cd /home/samuel/qresp_staging
sudo docker-compose -f docker-compose.dev.yml down
sudo docker-compose -p qresp_livetest -f docker-compose.staging-full.yml up --build -d
sudo docker cp ~/qresp-backups/explorer-<date> $(sudo docker-compose -p qresp_livetest -f docker-compose.staging-full.yml ps -q mongodb):/dump
sudo docker-compose -p qresp_livetest -f docker-compose.staging-full.yml exec mongodb mongorestore --drop /dump
```
Check `https://localhost:8444`: Explore lists the same records as the live
site; old records (charts, workflows) render; search works; dev-login as a
real owner's email can edit and share that record; a new record publishes.
Then:
```bash
sudo docker-compose -p qresp_livetest -f docker-compose.staging-full.yml down -v
sudo docker-compose -f docker-compose.dev.yml up -d
```

**OAuth.** Add `https://paperstack.uchicago.edu/api/auth/google/callback` to
the production Google OAuth client's authorized redirect URIs (and the
Microsoft / GitHub equivalents if enabled).

**Checkout.**
```bash
sudo mkdir /home/sushant/qresp_v2 && sudo chown samuel:samuel /home/sushant/qresp_v2
git clone https://github.com/qresp-code-development/qresp.git /home/sushant/qresp_v2
cd /home/sushant/qresp_v2 && git checkout vX.Y.Z
cp .env.prod.example .env.prod && chmod 600 .env.prod   # fill it in
```
`QRESP_PUBLIC_URL=https://paperstack.uchicago.edu` is required: email/password
sign-up is refused without it, because confirmation links are never built from
request headers. Mail settings can be copied from `[GLOBAL]`/`[SECRETS]` in the old
`backend/project/config.ini`. Generate the Flask key with `openssl rand -hex 32`.
Never set `QRESP_ENABLE_DEV_LOGIN`, `QRESP_PUBLISH_SKIP_EMAIL` or
`QRESP_OAUTHLIB_INSECURE_TRANSPORT` here.

**Certificate.** Check which file is current, then copy it:
```bash
for f in /home/sushant/qresp/nginx/paperstack_uchicago_edu_cert.cer*; do echo "$f: $(openssl x509 -enddate -noout -in $f)"; done
cp /home/sushant/qresp/nginx/paperstack_uchicago_edu_cert.cer nginx/nginx.crt
cp /home/sushant/qresp/nginx/paperstack.uchicago.edu.key     nginx/nginx.key
chmod 600 nginx/nginx.key
```

**Build ahead of time.**
```bash
sudo docker-compose build
```

## 3. Cut over (maintenance window)

```bash
cd /home/sushant/qresp && sudo docker-compose ps && sudo docker-compose down
cd ~/qresp-backups
mongodump --host 127.0.0.1 --port 27017 -u qresp_admin -p --authenticationDatabase admin --db explorer --out explorer-final
cd /home/sushant/qresp_v2
sudo docker-compose up -d mongodb
sudo docker cp ~/qresp-backups/explorer-final $(sudo docker-compose ps -q mongodb):/dump
sudo docker-compose exec mongodb mongorestore --drop /dump
sudo docker-compose up -d
sudo docker-compose ps
```

## 4. Verify

```bash
curl -s https://paperstack.uchicago.edu/api/healthz
./nginx/ratelimit-check.sh https://paperstack.uchicago.edu     # RESULT: PASS
sudo docker-compose logs --tail=100 backend
```
In a private window: home and Explore load with all records; Google sign-in
returns you signed in; old records open; a test publish goes live at once; creating an email/password account sends a confirmation
link that opens on `https://paperstack.uchicago.edu/verify-email` and, with
the password, signs you in; `http://` redirects to `https://`.

## Rollback

```bash
cd /home/sushant/qresp_v2 && sudo docker-compose down
cd /home/sushant/qresp    && sudo docker-compose up -d
```
The host MongoDB was never modified. Records published on 3.0 after the
cutover are not in it.

## Later releases

```bash
cd /home/sushant/qresp_v2
git fetch --tags && git checkout vX.Y.Z
sudo docker-compose up -d --build
```
Back up first:
```bash
sudo docker-compose exec -T mongodb mongodump --db explorer --archive --gzip > ~/qresp-backups/explorer-$(date +%F).archive.gz
```
(Restore with `sudo docker-compose exec -T mongodb mongorestore --drop --archive --gzip < <file>`.)

## Yearly certificate renewal (around November)

Replace `nginx/nginx.crt` and `nginx/nginx.key` in `/home/sushant/qresp_v2`
with the renewed pair, then `sudo docker-compose up -d --build nginx`.
