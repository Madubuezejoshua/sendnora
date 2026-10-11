#!/usr/bin/env bash
# Post-deployment smoke test. Usage:
#   API_URL=https://api.yourdomain.com WEB_URL=https://yourdomain.com ./scripts/smoke-test.sh
set -euo pipefail

API_URL="${API_URL:-http://localhost:4000}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
FAILED=0

check() {
  local description="$1"
  local url="$2"
  local expected_status="$3"

  status=$(curl -s -o /dev/null -w "%{http_code}" "$url" || echo "000")
  if [ "$status" = "$expected_status" ]; then
    echo "PASS: $description ($status)"
  else
    echo "FAIL: $description — expected $expected_status, got $status ($url)"
    FAILED=1
  fi
}

echo "Running smoke tests against API_URL=$API_URL WEB_URL=$WEB_URL"
echo

check "API liveness" "$API_URL/health" "200"
check "API readiness (database reachable)" "$API_URL/ready" "200"
check "Web app homepage" "$WEB_URL/" "200"
check "API rejects unauthenticated protected route" "$API_URL/api/v1/customers" "401"

echo
if [ "$FAILED" -eq 0 ]; then
  echo "All smoke checks passed."
  exit 0
else
  echo "One or more smoke checks failed."
  exit 1
fi
