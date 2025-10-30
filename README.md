# Homeostat

**An agentic fix pipeline that restores your repo to a steady, healthy state**

Homeostat is an automated error-fixing system that uses AI to detect, analyze, and repair bugs across multiple platforms. It integrates with GitHub Projects and uses a multi-tier AI strategy (DeepSeek V3.2-Exp + GPT-5) to fix errors automatically in Chrome extensions, WordPress plugins, and VPS tools.

## Features

- 🤖 **Automated Error Fixing**: AI-powered bug detection and repair
- 🔒 **Privacy-First**: Tiered security (sensitive files → GPT-5 only)
- 💰 **Cost-Effective**: $9.28/year for 1,000 fixes (97.7% savings vs alternatives)
- 📊 **Multi-Tier Strategy**: 70% DeepSeek (cheap) + 25% hybrid + 5% GPT-5 (complex)
- 🔄 **Smart Retry Logic**: 2-attempt strategy with deterministic failure detection
- ✅ **Test-Gated**: Only merges fixes that pass test suite
- 🏢 **Multi-Platform Support**: Fixes errors across Chrome extensions, WordPress plugins, and VPS tools
- 🎯 **Dual Parser Architecture**: Routes extension vs server formats automatically via source labels
- 🩹 **Self-Healing Pattern Library**: Feature-flagged learning captures successful patches and replays zero-cost fixes once confidence exceeds 80%
- 📈 **Enhanced Observability**: GitHub Action summaries, JSONL telemetry artifacts, and guardrail metrics keep automation accountable
- 🔐 **Atomic Circuit Breaker**: ETag-based locking prevents duplicate PRs when concurrent triggers (scheduled + webhook) fire simultaneously
- 💸 **Budget & Rate Limiting**: Per-repo caps ($0.066/day) with dual-window rate limiting (5/min burst, 20/day throughput) - git-persisted state with reservation/refund pattern

## Integration with CloakPipe

Homeostat receives errors from [CloakPipe](https://github.com/littlebearapps/cloakpipe) via GitHub issues.

### How It Works

1. **CloakPipe** captures error → sanitizes PII → creates GitHub issue with `robot` label
2. **Homeostat** (triggered by `robot` label) → routes to parser based on source → analyzes complexity → selects AI tier
3. **Validation** → runs test suite → creates PR if tests pass → comments with results

### Expected Issue Format

CloakPipe creates issues in platform-specific formats. **See [docs/CLOAKPIPE-INTEGRATION.md](docs/CLOAKPIPE-INTEGRATION.md) for complete details.**

**Chrome Extensions** (section format):
```markdown
Title: [NoteBridge] TypeError: Cannot read property 'sync' of undefined
Labels: robot, source:cloakpipe

## Error Details
- Extension: NoteBridge v1.2.0
- Fingerprint: abc123

## Stack Trace
(code block)

## Breadcrumbs
1. User clicked button
```

**WordPress/VPS** (section + bullet format):
```markdown
Title: [wp-navigator-pro] PDOException: Database connection failed
Labels: robot, source:wordpress

## Error Details
- Product: wp-navigator-pro v2.0.0
- Error Type: PDOException
- Message: Database connection failed
- Fingerprint: def456
- Occurrences: 3/3

## Stack Trace
(code block)
```

**Parser Routing**:
- `source:wordpress` or `source:vps` → parseServerIssue() (bullet format)
- `source:cloakpipe` or default → parseExtensionIssue() (section format)

## Architecture

- **Tier 1 (70%)**: Simple errors → DeepSeek only ($0.001/fix, 2 attempts)
- **Tier 2 (25%)**: Medium errors → DeepSeek + GPT-5 review ($0.015/fix, 2 attempts)
- **Tier 3 (5%)**: Complex/sensitive → GPT-5 only ($0.026/fix, 1 attempt)

## Documentation

- [CloakPipe Integration Contract](docs/CLOAKPIPE-INTEGRATION.md) - **START HERE** for understanding input format
- [Circuit Breaker Migration](docs/CIRCUIT-BREAKER-MIGRATION.md) - Atomic locking and race-condition hardening
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
2. CloakPipe creates GitHub issue with label `robot`
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
