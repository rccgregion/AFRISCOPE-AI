#!/usr/bin/env bash
# AfriScope AI smoke test.
#
# Usage:
#   scripts/smoke.sh                          # defaults to https://africscope.vercel.app
#   BASE_URL=http://127.0.0.1:3100 scripts/smoke.sh
#
# Checks, in order, exiting non-zero on the first failure:
#   1. GET  /api/health                    -> 200
#   2. GET  /api/auth/auto                 -> 200 and a token
#   3. GET  /api/workspace (Bearer token)  -> 200 and non-empty data
#   4. GET  /api/realtime/stream (ticket)  -> 200, content-type text/event-stream
#
# Requires: curl. Uses a short-lived realtime ticket (POST /api/realtime/ticket)
# because EventSource-style credentials are passed in the query string.
set -euo pipefail

BASE_URL="${BASE_URL:-${1:-https://africscope.vercel.app}}"
BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}
pass() {
  echo "PASS: $*"
}

# Extract a top-level string field from a JSON body without requiring jq.
json_field() {
  local field="$1" file="$2"
  sed -n "s/.*\"${field}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$file" | head -n 1
}

echo "== AfriScope smoke test: ${BASE_URL} =="

# 1. Health
health_status=$(curl -sS -o "$TMP_DIR/health.json" -w '%{http_code}' \
  --max-time 20 "${BASE_URL}/api/health" || true)
[ "$health_status" = "200" ] || fail "GET /api/health returned ${health_status} (expected 200): $(head -c 300 "$TMP_DIR/health.json" 2>/dev/null)"
grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' "$TMP_DIR/health.json" \
  || fail "GET /api/health did not report status ok: $(head -c 300 "$TMP_DIR/health.json")"
pass "GET /api/health -> 200 status ok"

# 2. Auth (POST is primary; GET is a documented fallback)
auth_status=$(curl -sS -o "$TMP_DIR/auth.json" -w '%{http_code}' --max-time 20 \
  -X POST "${BASE_URL}/api/auth/auto" \
  -H 'Content-Type: application/json' \
  -H 'X-AfriScope-Request: 1' \
  -d '{}' || true)
if [ "$auth_status" != "200" ]; then
  auth_status=$(curl -sS -o "$TMP_DIR/auth.json" -w '%{http_code}' --max-time 20 \
    "${BASE_URL}/api/auth/auto" || true)
fi
[ "$auth_status" = "200" ] || fail "POST/GET /api/auth/auto returned ${auth_status}: $(head -c 300 "$TMP_DIR/auth.json" 2>/dev/null)"
TOKEN="$(json_field token "$TMP_DIR/auth.json")"
[ -n "$TOKEN" ] || fail "GET /api/auth/auto returned 200 without a token: $(head -c 300 "$TMP_DIR/auth.json")"
pass "GET /api/auth/auto -> 200 with a token"

# 3. Workspace (must be non-empty)
ws_status=$(curl -sS -o "$TMP_DIR/workspace.json" -w '%{http_code}' --max-time 25 \
  -H "Authorization: Bearer ${TOKEN}" \
  "${BASE_URL}/api/workspace" || true)
[ "$ws_status" = "200" ] || fail "GET /api/workspace returned ${ws_status}: $(head -c 300 "$TMP_DIR/workspace.json" 2>/dev/null)"
ws_bytes=$(wc -c < "$TMP_DIR/workspace.json" | tr -d ' ')
[ "$ws_bytes" -gt 20 ] || fail "GET /api/workspace returned an empty body (${ws_bytes} bytes)"
grep -q '"projects"' "$TMP_DIR/workspace.json" || fail "GET /api/workspace has no projects field: $(head -c 300 "$TMP_DIR/workspace.json")"
# At least one project id must be present, otherwise the dashboard has nothing to render.
grep -Eq '"projects"[[:space:]]*:[[:space:]]*\[[[:space:]]*\{' "$TMP_DIR/workspace.json" \
  || fail "GET /api/workspace returned no projects (workspace would render empty)"
pass "GET /api/workspace -> 200 with non-empty data (${ws_bytes} bytes)"

# 4. Realtime stream via a short-lived ticket
ticket_status=$(curl -sS -o "$TMP_DIR/ticket.json" -w '%{http_code}' --max-time 20 \
  -X POST "${BASE_URL}/api/realtime/ticket" \
  -H 'Content-Type: application/json' \
  -H 'X-AfriScope-Request: 1' \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{}' || true)
TICKET=""
if [ "$ticket_status" = "200" ]; then
  TICKET="$(json_field ticket "$TMP_DIR/ticket.json")"
fi

stream_check() {
  # Returns "<http_code> <content_type>"
  local url="$1" out="$TMP_DIR/stream.txt"
  local meta
  meta=$(curl -sS -o "$out" -D "$TMP_DIR/headers.txt" -w '%{http_code}' \
    --max-time 5 "${url}" 2>/dev/null || true)
  local ctype
  ctype=$(sed -n 's/^[Cc]ontent-[Tt]ype:[[:space:]]*\(.*\)\r*$/\1/p' "$TMP_DIR/headers.txt" | head -n 1)
  printf '%s|%s' "$meta" "$ctype"
}

if [ -n "$TICKET" ]; then
  result=$(stream_check "${BASE_URL}/api/realtime/stream?ticket=${TICKET}")
else
  result=$(stream_check "${BASE_URL}/api/realtime/stream?token=${TOKEN}")
fi
stream_status="${result%%|*}"
stream_ctype="${result#*|}"
[ "$stream_status" = "200" ] || fail "GET /api/realtime/stream returned ${stream_status} (expected 200)"
case "$stream_ctype" in
  text/event-stream*) : ;;
  *) fail "GET /api/realtime/stream content-type was '${stream_ctype}' (expected text/event-stream)" ;;
esac
pass "GET /api/realtime/stream -> 200 ${stream_ctype}"

echo "== All smoke checks passed =="
