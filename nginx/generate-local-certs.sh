#!/usr/bin/env sh
# Generate self-signed TLS certificates for LOCAL / DEV Docker builds only.
#
# The nginx Dockerfiles COPY TLS certs that are intentionally NOT committed to
# the repo (private keys must never be committed; *.crt/*.key are git-ignored).
# Run this once before `docker compose build nginx` to create local dev certs.
#
#   sh nginx/generate-local-certs.sh
#
# Produces (git-ignored): nginx.crt / nginx.key, used by both nginx/Dockerfile
# and nginx/Dockerfile.dev (see default.conf: ssl_certificate /etc/certs/nginx.crt).
# Self-signed for CN=localhost; NOT suitable for production — supply real certs there.
set -e
cd "$(dirname "$0")"

# MSYS_NO_PATHCONV stops Git Bash/MSYS from rewriting "/CN=localhost" into a
# Windows path (harmless/ignored on Linux/macOS).
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout nginx.key -out nginx.crt \
  -days 365 -subj "/CN=localhost" >/dev/null 2>&1
echo "generated nginx.crt / nginx.key"

echo "Done. These files are git-ignored (dev only)."
