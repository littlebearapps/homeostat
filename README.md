# Homeostat

**An agentic fix pipeline that restores your repo to a steady, healthy state**

Homeostat is an automated error-fixing system that uses AI to detect, analyze, and repair bugs in your codebase. It integrates with GitHub Projects and uses a multi-tier AI strategy (DeepSeek V3.2-Exp + GPT-5) to fix errors automatically.

## Features

- 🤖 **Automated Error Fixing**: AI-powered bug detection and repair
- 🔒 **Privacy-First**: Tiered security (sensitive files → GPT-5 only)
- 💰 **Cost-Effective**: $9.28/year for 1,000 fixes (97.7% savings vs alternatives)
- 📊 **Multi-Tier Strategy**: 70% DeepSeek (cheap) + 25% hybrid + 5% GPT-5 (complex)
- 🔄 **Smart Retry Logic**: 2-attempt strategy with deterministic failure detection
- ✅ **Test-Gated**: Only merges fixes that pass test suite

## Integration with Logger

Homeostat receives errors from the [Logger](https://github.com/littlebearapps/logger) via GitHub issues.

### How It Works

1. **Logger** captures error in Chrome extension → sanitizes PII → creates GitHub issue with `robot` label
2. **Homeostat** (triggered by `robot` label) → analyzes complexity → selects AI tier → attempts fix
3. **Validation** → runs test suite → creates PR if tests pass → comments on issue with results

### Expected Issue Format

The logger creates issues in a specific format that Homeostat parses. **See [docs/LOGGER-INTEGRATION.md](docs/LOGGER-INTEGRATION.md) for the complete integration contract**, including:

- Exact issue title and body format
- Required fields (stack trace, error type, fingerprint, breadcrumbs)
- Parsing logic with code examples
- Privacy validation
- Error handling strategies

**Example Issue Title**: `[NoteBridge] TypeError: Cannot read property 'sync' of undefined`

**Required Labels**: `robot` (triggers Homeostat), extension name (e.g., `notebridge`)

**Critical Fields Homeostat Uses**:
- **Stack trace** - Error location and call chain (PII sanitized by logger)
- **Breadcrumbs** - User actions leading to error (max 50)
- **Error fingerprint** - Hash for deduplication (same error = same fingerprint)
- **Extension metadata** - Version, error type, timestamp

## Architecture

- **Tier 1 (70%)**: Simple errors → DeepSeek only ($0.001/fix, 2 attempts)
- **Tier 2 (25%)**: Medium errors → DeepSeek + GPT-5 review ($0.015/fix, 2 attempts)
- **Tier 3 (5%)**: Complex/sensitive → GPT-5 only ($0.026/fix, 1 attempt)

## Documentation

- [Logger Integration Contract](docs/LOGGER-INTEGRATION.md) - **START HERE** for understanding input format
- [Implementation Roadmap](docs/IMPLEMENTATION-ROADMAP.md) - Complete Phase 0-5 plan
- [DeepSeek Multi-AI Architecture](docs/DEEPSEEK-MULTI-AI-ARCHITECTURE.md) - System design
- [Privacy & Security Guide](docs/PRIVACY-SECURITY-GUIDE.md) - Security framework
- [Follow-Up Q&A](docs/FOLLOW-UP-QUESTIONS-ANSWERED.md) - Architectural decisions
- [API Documentation](docs/API.md) - Input contract, pipeline steps, and output formats
- [Deployment Guide](docs/DEPLOYMENT.md) - Install workflow, configure secrets, and validate setup
- [Operational Runbook](docs/RUNBOOK.md) - Day-2 operations, monitoring, and maintenance
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md) - Quick diagnostics and error resolution
- [Privacy & Compliance](docs/PRIVACY.md) - GDPR/CCPA guarantees and sanitization coverage

## Installation

Homeostat runs as a GitHub Actions workflow in your repository:

```yaml
# .github/workflows/homeostat.yml
name: Homeostat
on:
  issues:
    types: [labeled]

jobs:
  fix:
    if: github.event.label.name == 'robot'
    uses: littlebearapps/homeostat/.github/workflows/fix-error.yml@main
    secrets: inherit
```

## Usage

1. Error occurs in extension (e.g., NoteBridge)
2. Logger creates GitHub issue with label `robot`
3. Homeostat analyzes complexity and selects AI tier
4. Attempts fix (with retry logic)
5. Runs test suite to validate
6. Creates PR if tests pass
7. Comments on issue with results

## Cost Breakdown (Annual)

| Tier   | Volume    | Cost/Fix | Retry Rate | Annual Cost |
|--------|-----------|----------|------------|-------------|
| Tier 1 | 700 fixes | $0.001   | 2 attempts | $1.40       |
| Tier 2 | 250 fixes | $0.015   | 2 attempts | $7.50       |
| Tier 3 | 50 fixes  | $0.026   | 1 attempt  | $1.30       |
| Total  | 1,000     | -        | -          | $9.28       |

## Target Extensions

- NoteBridge (first deployment)
- PaletteKit
- ConvertMyFile

## Development Status

- ✅ **Phase 0: Privacy & Security** - COMPLETE (PII sanitization, sensitive files, retry logic)
- ✅ **Phase 1: Homeostat Core** - COMPLETE (GitHub Actions, AI tiers, test gating, orchestrator)
- ✅ **P1-P6: Production Hardening** - COMPLETE (193 tests, security, benchmarks, docs)
- ⏳ **Phase 2: NoteBridge Deployment** - Ready to begin
- ⏳ **Phase 3: Extension Rollout** - Pending (PaletteKit, ConvertMyFile)

**Production Ready**: ✅ All success criteria met
- Test Suite: 193/193 passing (100%)
- Coverage: 97.9%-100% on critical modules
- Cost: $5.77-$6.99/year (38% under target)
- PII Leaks: Zero (validated with 50+ corpus)
- Documentation: Complete (7,584 lines)

## Benchmarking & Cost Tracking

Run the synthetic benchmark to validate latency and projected spend using mocked AI calls:

```bash
npm run bench
```

Results are written to `benches/results/latest.json` and include median/p95 latency, tier token usage, and the projected annual
cost for 1,000 fixes. Use the cost checker to review per-tier spend assumptions:

```bash
npm run cost:check
```

Both commands execute locally in under 10 seconds and rely solely on simulated workloads—no external API access required.

## License

MIT © Little Bear Apps
