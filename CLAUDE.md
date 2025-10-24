# CLAUDE.md - Homeostat

## Overview
Homeostat is an agentic fix pipeline that restores your repo to a steady, healthy state. Uses multi-tier AI (DeepSeek V3.2-Exp + GPT-5) to automatically detect, analyze, and repair bugs in Chrome extensions.

**Annual Cost**: $9.28/year (1,000 fixes with retry logic)
**Target Extensions**: NoteBridge, PaletteKit, ConvertMyFile
**Architecture**: 3-tier privacy-first system validated by GPT-5

## Key Files
- `CLAUDE.md` - This file
- `.claude-context` - Session state
- `AGENTS.md` - AI agent coordination
- `README.md` - Project documentation
- `docs/LOGGER-INTEGRATION.md` - **Integration contract with logger (READ FIRST)**
- `docs/HIGH-PRIORITY-ENHANCEMENTS-PLAN.md` - **1-day implementation plan for enhancements**
- `docs/REMAINING-TASKS.md` - **Phase 2-3 deployment checklist**
- `docs/FUTURE-ENHANCEMENTS.md` - Deferred enhancements (post-production)
- `docs/IMPLEMENTATION-ROADMAP.md` - Complete Phase 0-5 implementation plan
- `docs/DEEPSEEK-MULTI-AI-ARCHITECTURE.md` - System architecture
- `docs/PRIVACY-SECURITY-GUIDE.md` - Security framework

## Integration with Logger

**CRITICAL**: Homeostat receives errors from the [Logger](https://github.com/littlebearapps/logger) via GitHub issues.

### Trigger Mechanism

Homeostat activates when a GitHub issue is created with the **`robot` label**:

```yaml
# GitHub Actions workflow
on:
  issues:
    types: [labeled]

jobs:
  fix:
    if: github.event.label.name == 'robot'
    uses: littlebearapps/homeostat/.github/workflows/fix-error.yml@main
```

### Expected Issue Format

**See [docs/LOGGER-INTEGRATION.md](docs/LOGGER-INTEGRATION.md) for the complete integration contract.**

**Quick Summary**:
- **Title**: `[ExtensionName] ErrorType: Error message`
- **Labels**: `robot` (required), extension name (e.g., `notebridge`)
- **Body Sections**: Error Details, Stack Trace, Breadcrumbs, User Description (optional)

**Required Fields for Homeostat**:
- Stack trace (PII sanitized by logger)
- Error type (for tier selection)
- Fingerprint (for deduplication)
- Breadcrumbs (user actions leading to error)
- Extension metadata (version, timestamp)

**Example Parsing**:
```javascript
const { extensionName, errorType } = parseIssueTitle(issue.title);
const { stackTrace, breadcrumbs, fingerprint } = parseIssueBody(issue.body);
// Use data for complexity analysis and fix generation
```

## 📖 Global Instructions

**⚠️ IMPORTANT**: Before working in this directory, review:
- `/Users/nathanschram/claude-code-tools/docs/QUICK-REFERENCE.md` - Comprehensive workflows guide ⭐
- `/Users/nathanschram/claude-code-tools/.claude-instructions` - Global development standards
- `/Users/nathanschram/claude-code-tools/ENHANCEMENTS.md` - Complete catalog of Claude Code enhancements

## 🔐 Keychain Secrets Management

**Status**: ✅ Production Ready

Required secrets for Homeostat:
- `DEEPSEEK_API_KEY` - DeepSeek V3.2-Exp API key
- `OPENAI_API_KEY` - GPT-5 API key (for Tier 2/3)
- `GITHUB_TOKEN` - GitHub PAT with `repo` + `project` scopes
- `SLACK_WEBHOOK_URL` - Notifications (optional)

All secrets stored in macOS Keychain (NO .env files!). Automatically loaded via `direnv`.

**Documentation**:
- Quick Reference: `~/claude-code-tools/keychain/KEYCHAIN-QUICK-REFERENCE.md`
- Complete Inventory: `~/claude-code-tools/keychain/secrets-inventory.md`

## 🤖 MCP Server Configuration

**Active Profile**: lean (zen only, ~3.2k tokens)

**Shared MCP Servers**:
- **zen** (instJ, port 7520) - Multi-model AI workflows (dedicated instance for Homeostat)
- **brave-search** - Web search (available in research/full profiles)
- **context7** - Library docs (available in research/full profiles)

**Switch Profiles**:
```bash
mcp-lean      # zen only (~3.2k tokens)
mcp-research  # zen + brave + context7 (~6.7k tokens)
mcp-full      # all servers (~11.2k tokens)
```

## 🤖 Available Subagents

- **git-workflow-manager v0.2.0** - Automated PR workflow (>60% time savings)
- **multi-project-tester** - Test all projects (75-80% time savings)

**Documentation**: `~/claude-code-tools/subagents/QUICK-START.md`

## Git Workflow (Feature-Branch)

**Structure**: `.bare/main` with feature branches (GitHub Flow)
- Main branch protected (requires PRs)
- All development in feature branches: `feature/*`, `fix/*`, `chore/*`
- Use git-workflow-manager for automated PR workflow

**Ship Features**:
```
User: "Use git-workflow-manager to ship this feature"
```

## Current Focus

**Date**: 2025-10-24
**Status**: ✅ **PRODUCTION READY** - All phases complete (Phase 0-1 + P0-P6)
**Test Results**: 193/193 tests passing (100%)
**Coverage**: 97.9%-100% on all critical modules
**Projected Cost**: $5.77-$6.99/year (38% under $9.28 target)
**Next Steps**:
- **Immediate**: Implement high-priority enhancements (see `docs/HIGH-PRIORITY-ENHANCEMENTS-PLAN.md`)
  - Multi-repository support (4-6 hours)
  - Self-healing loop with feature flag (6-8 hours)
  - Enhanced observability (2-3 hours)
- **After enhancements**: Deploy to Convert My File production (see `docs/REMAINING-TASKS.md`)

## Implementation Status

✅ **Phase 0 (Privacy & Security)**: COMPLETE
- PII sanitization engine (50+ patterns, 98.2% coverage)
- Sensitive file detection (16 patterns, 100% coverage)
- Model selection logic (privacy-first routing, 97.9% coverage)
- Retry logic with Levenshtein distance (100% coverage)

✅ **Phase 1 (Homeostat Core)**: COMPLETE
- GitHub Actions workflow (least-privilege, 15min timeout)
- Complexity analyzer + issue parser
- Multi-tier AI integration (Tier 1, 2, 3)
- Test suite gating
- Orchestrator (300 lines)
- Canary deployment (future-ready)

✅ **P1-P6 (Production Hardening)**: COMPLETE
- 193 tests (unit + integration + E2E + security + property)
- Security hardening (zero PII leaks validated)
- Benchmarking + cost tracking
- Structured logging, metrics, SLOs, alerts
- Complete documentation (7,584 lines)
- Release validation scripts

**Remaining**: Deploy to target extensions (see IMPLEMENTATION-ROADMAP.md Phase 2-3)

## Key References

- **ENHANCEMENTS.md**: `~/claude-code-tools/ENHANCEMENTS.md`
- **Quick Reference**: `~/claude-code-tools/docs/QUICK-REFERENCE.md`
- **Subagents Guide**: `~/claude-code-tools/subagents/README.md`
