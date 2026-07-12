#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-firecrawl-mcp-service:local-smoke}"
if [ "$#" -eq 0 ]; then
  docker build -f Dockerfile.service -t "$IMAGE" .
fi

TMPDIR="$(mktemp -d)"
keyless_cid=""
oauth_cid=""
cleanup() {
  if [ -n "${keyless_cid:-}" ]; then
    docker logs "$keyless_cid" || true
    docker rm -f "$keyless_cid" >/dev/null 2>&1 || true
  fi
  if [ -n "${oauth_cid:-}" ]; then
    docker logs "$oauth_cid" || true
    docker rm -f "$oauth_cid" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

wait_for_service() {
  local cid="$1"
  local port=""
  for _ in $(seq 1 60); do
    port=$(docker port "$cid" 8080/tcp 2>/dev/null | head -n1 | sed 's/.*://')
    if [ -n "${port:-}" ] && curl -fsS "http://127.0.0.1:$port/health" >/dev/null; then
      echo "$port"
      return 0
    fi
    sleep 1
  done
  return 1
}

wait_for_ready() {
  local port="$1"
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$port/ready" | grep -q '"ok":true'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

mcp_tools_list() {
  local port="$1"
  local endpoint="$2"
  local out="$3"
  shift 3
  curl -sS -o "$out.body" -D "$out.headers" -w '%{http_code}' \
    -H 'accept: application/json, text/event-stream' \
    -H 'content-type: application/json' \
    "$@" \
    -d '{"id":1,"jsonrpc":"2.0","method":"tools/list","params":{}}' \
    "http://127.0.0.1:$port$endpoint"
}

assert_tools() {
  local body_file="$1"
  local mode="$2"
  python3 - "$body_file" "$mode" <<'PY'
import json
import sys

body = open(sys.argv[1], encoding='utf-8').read()
mode = sys.argv[2]
line = next((entry for entry in body.splitlines() if entry.startswith('data: ')), None)
assert line, f'missing SSE data line: {body}'
tools = json.loads(line[6:])['result']['tools']
names = sorted(tool['name'] for tool in tools)
keyless = ['firecrawl_parse', 'firecrawl_scrape', 'firecrawl_search']
if mode == 'keyless':
    assert names == keyless, names
else:
    for name in keyless + ['firecrawl_crawl', 'firecrawl_monitor_get', 'firecrawl_research_read_paper']:
        assert name in names, (name, names)
    for tool in tools:
        requires_auth = tool.get('_meta', {}).get('requires_auth') is True
        assert requires_auth == (tool['name'] not in keyless), tool
PY
}

keyless_cid=$(docker run -d -P \
  -e FIRECRAWL_API_URL=https://api.firecrawl.dev \
  -e FIRECRAWL_MCP_ACTION_LOG_SECRET=action-log-secret \
  -e FIRECRAWL_OAUTH_INTROSPECT_SECRET=test-secret \
  -e KEYLESS_PROXY_SECRET=keyless-secret \
  "$IMAGE")

port=$(wait_for_service "$keyless_cid")
wait_for_ready "$port"
for endpoint in /v2/mcp /v2/mcp/ /mcp /mcp/; do
  out="$TMPDIR/keyless-${endpoint//\//_}"
  http_status=$(mcp_tools_list "$port" "$endpoint" "$out")
  cat "$out.headers"
  test "$http_status" = "200"
  ! grep -qi '^www-authenticate:' "$out.headers"
  assert_tools "$out.body" keyless
done

gated_out="$TMPDIR/keyless-gated-tool"
gated_status=$(curl -sS -o "$gated_out.body" -D "$gated_out.headers" -w '%{http_code}' \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -H 'x-forwarded-for: 8.8.8.8' \
  -d '{"id":2,"jsonrpc":"2.0","method":"tools/call","params":{"name":"firecrawl_map","arguments":{}}}' \
  "http://127.0.0.1:$port/v2/mcp")
test "$gated_status" = "200"
python3 - "$gated_out.body" <<'PY'
import json
import sys

body = open(sys.argv[1], encoding='utf-8').read()
line = next((entry for entry in body.splitlines() if entry.startswith('data: ')), None)
assert line, f'missing SSE data line: {body}'
result = json.loads(line[6:])['result']
assert result['isError'] is True, result
assert result['structuredContent']['code'] == 'KEYLESS_TOOL_NOT_AVAILABLE', result
PY

for endpoint in /fc-smoke-key/v2/mcp /fc-smoke-key/mcp; do
  out="$TMPDIR/legacy-${endpoint//\//_}"
  http_status=$(mcp_tools_list "$port" "$endpoint" "$out")
  cat "$out.headers"
  test "$http_status" = "200"
  ! grep -qi '^www-authenticate:' "$out.headers"
  assert_tools "$out.body" account
done

oauth_cid=$(docker run -d -P \
  -e FASTMCP_ENDPOINT=/v2/mcp-oauth \
  -e FIRECRAWL_API_URL=https://api.firecrawl.dev \
  -e FIRECRAWL_MCP_ACTION_LOG_SECRET=action-log-secret \
  -e FIRECRAWL_MCP_RESOURCE_URL=https://mcp.firecrawl.dev/v2/mcp-oauth \
  -e FIRECRAWL_OAUTH_INTROSPECT_SECRET=test-secret \
  "$IMAGE")
oauth_port=$(wait_for_service "$oauth_cid")
wait_for_ready "$oauth_port"
curl -fsS "http://127.0.0.1:$oauth_port/.well-known/oauth-protected-resource/v2/mcp-oauth" \
  | grep -q '"resource":"https://mcp.firecrawl.dev/v2/mcp-oauth"'
oauth_status=$(curl -sS -o "$TMPDIR/mcp-oauth-unauth.json" -D "$TMPDIR/mcp-oauth-headers.txt" -w '%{http_code}' \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -d '{"id":1,"jsonrpc":"2.0","method":"tools/list","params":{}}' \
  "http://127.0.0.1:$oauth_port/v2/mcp-oauth")
cat "$TMPDIR/mcp-oauth-headers.txt"
cat "$TMPDIR/mcp-oauth-unauth.json"
test "$oauth_status" = "401"
grep -q 'resource_metadata="https://mcp.firecrawl.dev/.well-known/oauth-protected-resource/v2/mcp-oauth"' "$TMPDIR/mcp-oauth-headers.txt"
! grep -q 'invalid_token' "$TMPDIR/mcp-oauth-headers.txt"
