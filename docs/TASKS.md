# Release Readiness Tasks

## P1: Comprehensive Testing Expansion

### Unit Tests
- [ ] Privacy sanitization: high-entropy tokens, partial emails, Unicode edge cases
- [ ] Sensitive file classifier: false positives/negatives across OS paths
- [ ] Tiered model selector: threshold edge cases and sensitive file overrides
- [ ] Retry logic: deterministic vs transient failures with timing metrics
- [ ] Malicious patch blocker: refusal cases and logging

### Property-Based Tests
- [ ] Issue parser fuzzing with malformed Logger payloads
- [ ] Stack trace sanitization with random PII insertion and entropy analysis

### Integration Tests
- [ ] Mock GitHub issues with various labels and tier escalations
- [ ] Threaded comments and re-runs via mocked Octokit responses
- [ ] Rate limit handling paths across tiers

### Scripts & Tooling
- [ ] `npm run test:unit`
- [ ] `npm run test:integration`
- [ ] `npm run test:watch`

## P2: Security Review and Hardening

### Sanitization & Prompt Security
- [ ] Synthetic PII corpus validation harness
- [ ] Prompt injection adversarial suite referencing OWASP 2025 mitigations
- [ ] Log sanitization verification for all tiers

### Supply Chain & Workflow
- [ ] `npm audit --production` baseline with documented exceptions
- [ ] SCA integration (e.g., Snyk or GitHub Advanced Security)
- [ ] GitHub Actions OIDC federation with least-privilege IAM role
- [ ] Secrets management policy update (no long-lived PATs)

### Reporting
- [ ] Security review summary doc with remediation owners

## P3: Production Readiness (Performance, Cost, Monitoring)

### Benchmarking
- [ ] Latency benchmarking harness for each tier (median/P95)
- [ ] Token usage sampling per attempt, including retries
- [ ] Retry latency impact analysis

### Cost Management
- [ ] Implement `scripts/cost-estimator.ts`
- [ ] Cost projection dashboard and weekly report
- [ ] Budget breach alert rules tied to projections

### Observability
- [ ] Structured logging (JSON) with sanitizer integration
- [ ] Metrics export (Prometheus/OpenTelemetry)
- [ ] Tracing spans for tier execution path
- [ ] PagerDuty/Slack alert routing configuration

## P4: Integration Validation (E2E)

### Workflows
- [ ] Mock GitHub server for issue lifecycle
- [ ] Workflow dispatch scenarios for robot label toggling
- [ ] Canary rollout rehearsal scripts (progressive + rollback)

### Test Suites
- [ ] Golden-path scenario for each target extension
- [ ] Failure-mode coverage (sanitizer miss, API outage, retry exhaustion)
- [ ] Logger schema compliance validator

### Tooling
- [ ] `npm run test:e2e`
- [ ] Test data reset/cleanup utilities

## P5: Documentation and Operational Runbook

### Core Docs
- [ ] API reference detailing sanitizer requirements and tier routing
- [ ] Deployment guide (secrets, permissions, environment setup)
- [ ] Operational runbook (alert response, escalation path)
- [ ] Troubleshooting guide (common failure signatures)
- [ ] Privacy/security compliance report referencing sanitizer corpus results

### Review & Publishing
- [ ] Stakeholder review checklist
- [ ] Versioned documentation release notes

## P6: Gatekeeper – Release Candidate Assembly

### Automation
- [ ] Complete `.github/workflows/release-readiness.yml`
- [ ] Checklist validation script integrating coverage, security, cost reports
- [ ] Tagging automation for `v1.0-rc`

### Governance
- [ ] Release notes draft for RC
- [ ] Final sign-off meeting agenda and minutes
- [ ] Rollback playbook verification

### Final Verification
- [ ] Scheduled workflow dry run success record
- [ ] Manual `workflow_dispatch` validation for all jobs

