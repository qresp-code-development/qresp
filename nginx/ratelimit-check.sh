#!/usr/bin/env bash
# Staging-only burst check for the nginx rate-limit scoping.
#
# Why: a single server-wide `limit_req` used to throttle every request, so one
# Next.js page load (dozens of /_next/static chunks at once) drained the burst
# and nginx answered 503 for the page itself. After a successful Google
# sign-in this looked like an auth failure. This script proves a fresh page
# load and a callback-style redirect no longer produce 503.
#
#   ./nginx/ratelimit-check.sh https://localhost:8443
#
# Uses -k because staging runs behind a self-signed cert on the SSH tunnel.
# Read-only: it issues GETs only, and never sends credentials or a real
# authorization code.
set -u

BASE="${1:-https://localhost:8443}"
CURL=(curl -sk -o /dev/null -w "%{http_code}")
FAILED=0

status() { "${CURL[@]}" "$1"; }

check_no_503() {
  local label="$1" url="$2" n="${3:-1}"
  local codes="" code
  for _ in $(seq 1 "$n"); do
    code="$(status "$url")"
    codes="$codes $code"
    if [ "$code" = "503" ] || [ "$code" = "429" ]; then
      FAILED=1
    fi
  done
  if [ "$FAILED" -eq 0 ]; then
    printf 'PASS  %-42s %s\n' "$label" "$codes"
  else
    printf 'FAIL  %-42s %s   <-- throttled\n' "$label" "$codes"
  fi
}

echo "Target: $BASE"
echo

# 1. A cold page load: the document plus a realistic burst of build assets.
check_no_503 "login page document" "$BASE/login" 5

echo "-- asset burst (60 parallel requests to /_next/) --"
ASSET_URL="$BASE/_next/static/chunks/webpack.js"
BURST_CODES="$(for _ in $(seq 1 60); do
  curl -sk -o /dev/null -w '%{http_code}\n' "$ASSET_URL" &
done | sort | uniq -c | tr '\n' ' ')"
echo "   $BURST_CODES"
case "$BURST_CODES" in
  *503*|*429*) echo "FAIL  static assets are being rate limited"; FAILED=1 ;;
  *)           echo "PASS  static assets are not rate limited" ;;
esac
echo

# 2. Ordinary navigation must survive a rapid click-through.
for path in / /login /account /curator; do
  check_no_503 "navigation $path" "$BASE$path" 10
done

# 3. The session probe runs on every page mount.
check_no_503 "session probe /api/auth/me" "$BASE/api/auth/me" 30

# 4. A callback-shaped request (no real code) must be answered by the app,
#    not rejected by the limiter. 400 here is the CORRECT answer: invalid
#    state. Only 503/429 would mean nginx got in the way.
CB="$(status "$BASE/api/auth/google/callback?state=probe&code=probe")"
if [ "$CB" = "503" ] || [ "$CB" = "429" ]; then
  printf 'FAIL  %-42s %s   <-- throttled\n' "google callback reachable" "$CB"
  FAILED=1
else
  printf 'PASS  %-42s %s (400 = app rejected the fake state)\n' \
    "google callback reachable" "$CB"
fi

echo
echo "Also confirm the ACCESS LOG redacts the callback query:"
echo "  docker compose -p qresp_staging logs nginx | grep auth/google/callback"
echo "  -> must show '/api/auth/google/callback?[redacted]', never code=/state="

echo
if [ "$FAILED" -eq 0 ]; then
  echo "RESULT: PASS — no request was throttled."
else
  echo "RESULT: FAIL — something above was throttled; check limit_req scoping."
fi
exit "$FAILED"
