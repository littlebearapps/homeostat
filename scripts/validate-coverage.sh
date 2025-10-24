#!/bin/bash
set -euo pipefail

RESULTS_DIR="release/evidence"
mkdir -p "$RESULTS_DIR"

COVERAGE_LOG="$RESULTS_DIR/coverage.log"
COVERAGE_JSON="$RESULTS_DIR/coverage-summary.json"

echo "📊 Validating test coverage..."

npm run test:coverage:critical -- --reporter=json --outputFile "$RESULTS_DIR/coverage-report.json" \
  >"$COVERAGE_LOG" 2>&1

default_summary="coverage/coverage-summary.json"
fallback_json="coverage/coverage-final.json"

if [ -f "$default_summary" ]; then
  cp "$default_summary" "$COVERAGE_JSON"
elif [ -f "$fallback_json" ]; then
  COVERAGE_PATH="$COVERAGE_JSON" node <<'NODE'
const { readFileSync, writeFileSync } = require('fs');
const path = process.env.COVERAGE_PATH;
const coverage = JSON.parse(readFileSync('coverage/coverage-final.json', 'utf8'));
const summary = {};
const totals = { lines: { total: 0, covered: 0, pct: 0 }, statements: { total: 0, covered: 0, pct: 0 }, branches: { total: 0, covered: 0, pct: 0 }, functions: { total: 0, covered: 0, pct: 0 } };

for (const [file, metrics] of Object.entries(coverage)) {
  summary[file] = {
    lines: metrics.lines,
    statements: metrics.statements,
    branches: metrics.branches,
    functions: metrics.functions
  };
  for (const key of Object.keys(totals)) {
    totals[key].total += metrics[key].total;
    totals[key].covered += metrics[key].covered;
  }
}

for (const key of Object.keys(totals)) {
  totals[key].pct = totals[key].total === 0 ? 0 : (totals[key].covered / totals[key].total) * 100;
}

summary.total = totals;
writeFileSync(path, JSON.stringify(summary, null, 2));
NODE
else
  echo "❌ Coverage artifacts not found" | tee -a "$COVERAGE_LOG"
  exit 1
fi

COVERAGE_PATH="$COVERAGE_JSON" node <<'NODE'
const { readFileSync } = require('fs');
const path = process.env.COVERAGE_PATH;
const data = JSON.parse(readFileSync(path, 'utf8'));
const thresholds = {
  'shared/privacy/sanitizer.js': 95,
  'homeostat/config/sensitive-files.js': 95,
  'homeostat/routing/model-selector.js': 95,
  'homeostat/execution/retry-handler.js': 95
};
let passed = true;
for (const [file, threshold] of Object.entries(thresholds)) {
  const entry = Object.entries(data).find(([key]) => key === file || key.endsWith(`/${file}`));
  if (!entry) {
    console.log(`❌ Missing coverage for ${file}`);
    passed = false;
    continue;
  }
  const [, metrics] = entry;
  const pct = metrics.lines?.pct ?? 0;
  if (pct < threshold) {
    console.log(`❌ ${file}: ${pct.toFixed(1)}% < ${threshold}%`);
    passed = false;
  } else {
    console.log(`✅ ${file}: ${pct.toFixed(1)}%`);
  }
}
if (!passed) {
  process.exit(1);
}
console.log('\n✅ All coverage thresholds met!');
NODE
