#!/bin/bash
set -euo pipefail

RESULTS_DIR="release/evidence"
mkdir -p "$RESULTS_DIR"

BENCH_LOG="$RESULTS_DIR/benchmark.log"
SLO_LOG="$RESULTS_DIR/slo-check.log"

echo "💰 Running benchmark and validating SLOs..."

if npm run bench >"$BENCH_LOG" 2>&1; then
  echo "✅ Benchmark completed" | tee -a "$BENCH_LOG"
else
  echo "❌ Benchmark failed" | tee -a "$BENCH_LOG"
  exit 1
fi

if npm run slo:check >"$SLO_LOG" 2>&1; then
  echo "✅ All SLOs met" | tee -a "$SLO_LOG"
else
  echo "❌ SLO breach detected" | tee -a "$SLO_LOG"
  exit 1
fi

echo
echo "Key Metrics:"
echo "------------"
grep -m1 'Projected annual cost' "$BENCH_LOG" || true
grep -m1 'Median latency' "$BENCH_LOG" || true
grep -m1 'Cost:' "$SLO_LOG" || true
grep -m1 'Success Rate:' "$SLO_LOG" || true
