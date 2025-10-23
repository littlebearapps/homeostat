# Homeostat Release Readiness Plan

## Gap Analysis

| Area | Current State (with references) | Gap | Risk & Impact | Priority |
|------|---------------------------------|-----|---------------|----------|
| Sanitization Coverage | `shared/privacy/sanitizer.js` lines 81-97 enforce regex substitutions for key PII strings:<br>```
  sanitized = sanitized.replace(EXTENSION_ID_REGEX, REDACTION.extensionId);
  ...
  sanitized = replaceHighEntropyTokens(sanitized);
```
| Property-based fuzzing not yet validating entropy heuristics or Unicode edge cases. | Undetected PII variants could leak to models, breaching GDPR. | P0 |
| Sensitive File Routing | `homeostat/routing/model-selector.js` lines 49-70 gate sensitive files to Tier 3:<br>```
  if (filesInvolved.some((file) => isSensitiveFile(file))) {
    return { tier: 3, model: 'gpt-5', sanitize: true, attempts: 1 };
  }
```
| No integration regression tests to ensure new paths/labels stay compliant. | Future refactors could route sensitive data to DeepSeek. | P0 |
| Retry Handler Determinism | `homeostat/execution/retry-handler.js` lines 95-114 escalate deterministic failures:<br>```
      if (attemptIndex > 0 && isSameError(attempts[attemptIndex - 1], result)) {
        return { success: false, shouldEscalate: true, reason: 'deterministic_failure', attempts };
      }
```
| Missing performance benchmarks for retry latency and cost tracking. | Unbounded retries could violate SLA and cost ceiling. | P1 |
| GitHub Actions Workflow | `.github/workflows/homeostat.yml` lines 1-82 orchestrate current automation.<br>(Workflow lacks OIDC hardening and artifact signing.) | Secrets are long-lived PATs; no workload identity federation. | P0 |
| Observability | Tier executors emit sanitized payloads but no metrics (see `homeostat/execution/ai-utils.js` lines 78-105). | Lacks structured logging, metrics, or tracing for production SLOs. | P1 |
| Documentation | README describes architecture but no runbooks or cost budgeting guides. | On-call engineers lack playbooks for triage/rollback. | P0 |
| Cost Tracking | No script currently computes $9.28/year validation. | Inability to gate releases on budget compliance. | P0 |

## Work Breakdown

### P1: Comprehensive Testing Expansion
- **Scope**: Extend unit, integration, and property-based tests covering sanitizer entropy, sensitive routing regressions, retry latency, and malicious patch blocking. Introduce mock Logger issue fixtures spanning target extensions.
- **Acceptance Criteria**: ≥95% coverage on sanitizer, model selector, retry handler; property-based suite demonstrates ≥1,000 iterations without failure; integration tests validate stack traces for NoteBridge, PaletteKit, ConvertMyFile.
- **Deliverables**: Enhanced test files under `tests/privacy`, `tests/routing`, `tests/execution`; new fixtures in `tests/fixtures`; CI split commands (`npm run test:unit`, `npm run test:integration`).
- **Estimated Duration**: 8 hours.
- **Dependencies**: Existing sanitizer/regression tests; fixture schemas from Logger.
- **Out of Scope**: Production deployment or workflow changes.

### P2: Security Review and Hardening
- **Scope**: Conduct synthetic PII corpus validation, prompt-injection red teaming, dependency scanning, and GitHub Actions hardening. Align with 2025 OIDC recommendations (rotating trust boundaries, `permissions:` minimal scopes, short-lived tokens).
- **Acceptance Criteria**: Sanitizer corpus yields zero leaks; OWASP prompt injection tests pass; `npm audit --production` clean of high severity; workflow uses OIDC with role-based access and secretless cloud auth.
- **Deliverables**: Security test scripts, updated workflow secrets policy, documentation addendum summarizing review.
- **Estimated Duration**: 6 hours.
- **Dependencies**: P1 fixtures for sanitized payloads.
- **Out of Scope**: Legal compliance sign-off.

### P3: Production Readiness (Performance, Cost, Monitoring)
- **Scope**: Benchmark tier latency/token usage, implement `scripts/cost-estimator.ts`, wire metrics (request/latency budgets), configure alerting on SLO breaches and cost overruns.
- **Acceptance Criteria**: Median fix time <5 minutes; projected annual cost ≤$9.28; dashboards tracking tier distribution, retry rate, sanitizer misses; alert thresholds codified.
- **Deliverables**: Benchmark scripts, Prometheus/OpenTelemetry exporters, finalized cost estimator.
- **Estimated Duration**: 7 hours.
- **Dependencies**: P1 testing harness, P2 hardened workflows for instrumentation.
- **Out of Scope**: Vendor contract negotiation.

### P4: Integration Validation (E2E)
- **Scope**: Mock GitHub server tests for label workflows, canary rollout rehearsals, golden-path + failure-mode scripts for rollback.
- **Acceptance Criteria**: End-to-end suite passes for NoteBridge, PaletteKit, ConvertMyFile; canary rollback triggers on simulated 6% error rate; Logger schema validation asserts required fields per `docs/LOGGER-INTEGRATION.md` lines 55-218.
- **Deliverables**: E2E test harness (likely Playwright + mocked APIs), updated fixtures, CI job `npm run test:e2e`.
- **Estimated Duration**: 6 hours.
- **Dependencies**: P1 tests, P3 monitoring hooks for capturing metrics during flows.
- **Out of Scope**: Production GitHub issue manipulation.

### P5: Documentation and Operational Runbook
- **Scope**: Produce API references, deployment guide (secrets, permissions), operational runbook, troubleshooting and compliance documentation referencing sanitizer/routing obligations.
- **Acceptance Criteria**: Runbook covers alert response, rollback (via `homeostat/deployment/canary.js`), and escalation paths; documentation reviewed by privacy/security stakeholders; all docs incorporate sanitized log procedures.
- **Deliverables**: New files under `docs/` (API.md, Deployment.md, Runbook.md, Troubleshooting.md, Privacy-Compliance.md).
- **Estimated Duration**: 5 hours.
- **Dependencies**: Outputs from P2-P4 to document instrumentation and alerts.
- **Out of Scope**: Marketing collateral.

### P6: Gatekeeper – Release Candidate Assembly
- **Scope**: Aggregate release checklist, automate `.github/workflows/release-readiness.yml` jobs, tag `v1.0-rc`, compile release notes.
- **Acceptance Criteria**: Workflow verifies gaps resolved, coverage thresholds met, cost estimator passes; manual checklist executed; release notes ready for publication.
- **Deliverables**: Finalized workflow steps, `RELEASE_NOTES.md`, `v1.0-rc` tagging playbook.
- **Estimated Duration**: 4 hours.
- **Dependencies**: Completion of P1-P5.
- **Out of Scope**: GA launch activities.

*Total Estimated Duration: 36 hours (within the 30-40 hour envelope).* 

## Test Strategy Matrix

| Test Type | Scope | Tools | Coverage Target | CI Integration |
|-----------|-------|-------|-----------------|----------------|
| Unit | Sanitizer regexes, model routing branches, retry handler, malicious patch detection | Vitest, NYC coverage | ≥ 95% critical modules, ≥ 90% overall | `npm run test:unit` in `release-readiness.yml` coverage-check job |
| Property-Based | Issue parser fuzzing, stack trace sanitization permutations, entropy-based token detection | fast-check, custom generators | 1,000 iterations per suite with zero failures | Included in unit pipeline with separate report |
| Integration | Tier executor + retry orchestration with mocked APIs, GitHub issue parsing/dispatch | Vitest integration harness, supertest for mocked endpoints | Cover 100% of tier routing branches | `npm run test:integration` gated in CI |
| E2E | Workflow dispatch → canary deployment → rollback across target extensions | Playwright/Octokit mocks, local GitHub Actions runner | Validate golden path + 3 failure modes per extension | `npm run test:e2e` in `e2e-validation` job |
| Security | Synthetic PII leak scans, prompt injection suites, dependency audit | Custom corpus scanner, OWASP ZAP (for prompts), `npm audit`, `snyk` | Zero critical leaks/vulns | `security-scan` job with artifacted reports |

## Cost Guardrails

1. **Token Accounting**: Capture per-tier token usage by instrumenting AI executor contexts (see `homeostat/execution/ai-utils.js` lines 47-59, where request payloads are assembled) and log sanitized metrics for prompt/response tokens.
2. **Per-Fix Budget Limits**: Enforce ceiling in executors—Tier 1 ≤ $0.0015, Tier 2 ≤ $0.02, Tier 3 ≤ $0.028 including retries. Abort retries once estimate exceeds threshold.
3. **Annual Projection**: Use `scripts/cost-estimator.ts` to model 1,000 fixes/year with 70/25/5 distribution, factoring retry rate from P1 benchmarking.
4. **Budget Breach Alerting**: Emit Prometheus metric `homeostat_cost_projection` and configure alert when trailing 30-day projection exceeds $9.28/year; integrate with PagerDuty and Slack.
5. **Review Cadence**: Weekly scheduled workflow (`release-readiness.yml`) runs cost validation job comparing actual vs projected spend.

## Definition of Done

- [ ] All unit, property-based, integration, E2E, and security tests pass on `main`.
- [ ] Coverage ≥95% for sanitizer, sensitive file detection, model selector, retry handler (report artifact stored).
- [ ] Synthetic PII corpus scan reports zero unredacted secrets.
- [ ] Prompt injection stress tests record zero policy bypasses.
- [ ] Benchmarks demonstrate median fix time ≤ 5 minutes and 95th percentile ≤ 8 minutes.
- [ ] Annualized cost projection ≤ $9.28 with documented calculation.
- [ ] Observability dashboards (metrics + tracing) reviewed and alert thresholds approved.
- [ ] Canary deployment dry run completed with automated rollback verification.
- [ ] GitHub Actions workflows use OIDC, least-privilege permissions, and secret scanning.
- [ ] Documentation set (API, Deployment, Runbook, Troubleshooting, Privacy Compliance) reviewed and approved.
- [ ] Release notes drafted and staged for v1.0-rc tag.
- [ ] `release-readiness.yml` workflow green across scheduled run and manual dispatch.

