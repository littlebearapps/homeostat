# Homeostat Security Overview

## Threat Model

- **Adversarial GitHub Issues**: Attackers may submit malicious payloads, prompt injections, or oversized data through issues labeled `robot`.
- **Prompt/Code Injection**: Model responses could be coerced into leaking secrets or applying unsafe patches.
- **Supply Chain**: Compromised dependencies or CI/CD workflows could introduce backdoors.
- **Data Privacy**: Logger-provided stack traces may contain PII that must never leave the sanitization boundary.

## Key Mitigations

- **Sanitization Gateway**: `shared/privacy/sanitizer.js` redacts 20+ PII patterns, including query-string secrets and high-entropy tokens, before any AI call.
- **Malicious Patch Blocking**: `homeostat/execution/ai-utils.js` rejects diffs touching sensitive files or containing dangerous APIs (`eval`, `child_process`, exfiltration fetches).
- **Corpus-Based Regression**: `tests/security/pii-leak.test.ts` and `tests/security/malicious-payloads.test.ts` ensure zero PII leakage and deterministic blocking for 10+ attack classes.
- **CI Hardening**: `.github/workflows/homeostat.yml` runs with least-privilege permissions, 15-minute timeouts, and per-issue concurrency control.
- **Dependency Hygiene**: `.github/workflows/security.yml` executes npm audit, lockfile linting, gitleaks, and optional Snyk scans weekly and on every PR.

## Reporting Vulnerabilities

Please email security@littlebearapps.com with reproduction steps. Expect acknowledgement within 48 hours and a remediation plan within five business days.
