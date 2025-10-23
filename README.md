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

## Architecture

- **Tier 1 (70%)**: Simple errors → DeepSeek only ($0.001/fix, 2 attempts)
- **Tier 2 (25%)**: Medium errors → DeepSeek + GPT-5 review ($0.015/fix, 2 attempts)
- **Tier 3 (5%)**: Complex/sensitive → GPT-5 only ($0.026/fix, 1 attempt)

## Documentation

- [Implementation Roadmap](docs/IMPLEMENTATION-ROADMAP.md) - Complete Phase 0-5 plan
- [DeepSeek Multi-AI Architecture](docs/DEEPSEEK-MULTI-AI-ARCHITECTURE.md) - System design
- [Privacy & Security Guide](docs/PRIVACY-SECURITY-GUIDE.md) - Security framework
- [Follow-Up Q&A](docs/FOLLOW-UP-QUESTIONS-ANSWERED.md) - Architectural decisions

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

- ⏳ Phase 0: Privacy & Security (8-10 hours) - In planning
- ⏳ Phase 1-5: Implementation (37-53 hours) - Documented

## License

MIT © Little Bear Apps
