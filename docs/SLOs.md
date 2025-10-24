# Service Level Objectives (SLOs)

These objectives provide measurable guardrails for Homeostat's production readiness and align with the Release Readiness Plan.

## Cost
- **Target:** ≤ $9.28 per 1,000 fixes
- **Measurement:** Real-time tracking via `CostTracker.projectAnnualCost()`
- **Alert Threshold:** Projected annual cost > $10.00

## Reliability
- **Overall Success Rate:** ≥ 70%
- **Tier 1 Success Rate:** ≥ 60%
- **Tier 2 Success Rate:** ≥ 80%
- **Tier 3 Success Rate:** ≥ 90%
- **Measurement:** `MetricsCollector.getSuccessRate()` and tier counts
- **Alert Threshold:** Overall success rate < 60% over the trailing 7 days

## Privacy
- **Target:** 0 PII leaks (zero tolerance)
- **Measurement:** Security test suite and PII leak validation harness
- **Alert Threshold:** Any detected PII pattern in logs or model payloads

## Security
- **Target:** 100% malicious patch detection and blocking
- **Measurement:** Malicious payload regression suite
- **Alert Threshold:** Any malicious patch bypassing controls

## Performance (Aspirational)
- **Median Latency:** < 5 minutes per fix
- **p95 Latency:** < 15 minutes per fix
- **Measurement:** Benchmark harness (`npm run bench`)
- **Alert Threshold:** p95 latency > 20 minutes (manual review required)

