# Homeostat Test Suite

This directory groups tests by purpose to satisfy the release readiness roadmap.

- `tests/unit/` — Fine-grained checks for critical modules (sanitizer, sensitive-file routing, model selector, retry logic, security guards).
- `tests/property/` — Property-based fuzzers using **fast-check** to guarantee robustness for parser and sanitization logic.
- `tests/integration/` — Cross-module flows that validate GitHub ingestion, rate-limit handling, and tier routing with mocks.
- `tests/security/` — Corpus-driven leak detection and malicious payload resistance checks that enforce zero-PII guarantees.
- `tests/fixtures/` — Static payloads and PII corpora referenced by integration and unit tests for deterministic coverage.
- `tests/mocks/` — Lightweight mocks for GitHub, AI models, and issue generation shared across suites.

## Running Tests

```bash
npm test              # Run the entire suite
npm run test:unit     # Execute only unit tests in tests/unit
npm run test:property # Execute property-based fuzz tests
npm run test:integration # Execute integration flows
npm run test:security   # Execute security regression suite
npm run test:coverage       # Collect coverage for the entire suite
npm run test:coverage:critical # Enforce ≥95% coverage on critical modules
```

Each test file includes descriptive comments naming the scenario it protects, and fixtures are annotated via filename to clarify usage (for example, `valid-simple.json` is a Tier 1 Logger issue).
