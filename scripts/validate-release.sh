#!/bin/bash
set -euo pipefail

RESULTS_DIR="release/evidence"
mkdir -p "$RESULTS_DIR"

printf '🔍 Homeostat Release Validation\n================================\n\n'

run_tests() {
  local name="$1"
  local command="$2"
  local log_file="$3"

  printf '%s\n' "$name"
  if eval "$command" >"$log_file" 2>&1; then
    echo "✅ ${name#* } passed" | tee -a "$log_file"
  else
    echo "❌ ${name#* } failed" | tee -a "$log_file"
    exit 1
  fi
  echo
}

run_tests "1️⃣ Running unit tests..." "npm run test:unit" "$RESULTS_DIR/unit-tests.log"
run_tests "2️⃣ Running integration tests..." "npm run test:integration" "$RESULTS_DIR/integration-tests.log"
run_tests "3️⃣ Running property-based tests..." "npm run test:property" "$RESULTS_DIR/property-tests.log"
run_tests "4️⃣ Running E2E tests..." "CI=1 npm run test:e2e" "$RESULTS_DIR/e2e-tests.log"
run_tests "5️⃣ Running security tests..." "npm run test:security" "$RESULTS_DIR/security-tests.log"

echo "✅ All test suites passed!"
