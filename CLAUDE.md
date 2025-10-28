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
- `docs/NEXT-STEPS.md` - **Testing, deployment, and validation guide (START HERE)** ⭐
- `docs/REMAINING-TASKS.md` - **Phase 2-3 deployment checklist**
- `docs/CIRCUIT-BREAKER-MIGRATION.md` - **Circuit breaker atomic locking migration guide** ⭐
- `docs/CLOAKPIPE-INTEGRATION.md` - **Integration contract with CloakPipe**
- `docs/HIGH-PRIORITY-ENHANCEMENTS-PLAN.md` - Completed 1-day implementation plan
- `docs/FUTURE-ENHANCEMENTS.md` - Deferred enhancements (post-production)
- `docs/IMPLEMENTATION-ROADMAP.md` - Complete Phase 0-5 implementation plan
- `docs/DEEPSEEK-MULTI-AI-ARCHITECTURE.md` - System architecture
- `docs/PRIVACY-SECURITY-GUIDE.md` - Security framework

## Integration with CloakPipe

**CRITICAL**: Homeostat receives errors from [CloakPipe](https://github.com/littlebearapps/cloakpipe) via GitHub issues.

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

**See [docs/CLOAKPIPE-INTEGRATION.md](docs/CLOAKPIPE-INTEGRATION.md) for the complete integration contract.**

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

**Date**: 2025-10-28
**Status**: ✅ **PRODUCTION READY + RACE-CONDITION HARDENING COMPLETE**
**Test Results**: 230/230 tests passing (100%)
**Coverage**: 97.9%-100% on all critical modules
**Projected Cost**: $5.77-$6.99/year (38% under $9.28 target)
**New Capabilities**:
- ✅ Multi-repository support (central orchestrator + repo manager)
- ✅ Self-healing loop with feature flag (fingerprinting, pattern learning, cooldown store)
- ✅ Enhanced observability (summaries, JSONL telemetry, safety guardrails)
- ✅ **Atomic circuit breaker locking** (ETag-based, prevents duplicate PRs from concurrent triggers)

**Latest**:
- ✅ Atomic locking implemented (3.5 hours) - prevents race conditions when scheduled + webhook triggers run simultaneously
- ✅ Circuit breaker labels created on all extension repos (5 min) - NoteBridge, Convert My File, Palette Kit
- ✅ CloakPipe Phase 3 complete - label emission LIVE in production! 🎉
- ✅ **Phase 2 COMPLETE** - Convert My File fully deployed and tested (2025-10-28)
  - Homeostat workflow installed and validated
  - GitHub Secrets configured (DEEPSEEK_API_KEY, OPENAI_API_KEY, HOMEOSTAT_PAT)
  - Branch protection enabled with required status checks
  - End-to-end pipeline tested successfully (issue #14)

**Next Steps**: Production Monitoring & Real Error Testing

### Testing with Real Errors from Convert My File

**Phase**: Waiting for Production Errors (Task 2.6 - First 10 Fixes Monitoring)

**How It Works**:
1. User encounters error in Convert My File extension
2. CloakPipe captures error and creates GitHub issue with `robot` label
3. Homeostat workflow triggers automatically
4. Homeostat analyzes error, creates fix PR with proposed solution
5. Developer reviews PR, verifies fix, and merges

**Monitoring Checklist** (First 10 Fixes):
- [ ] **Fix #1**: Deep analysis (tier selection, cost, time, PII sanitization, code quality)
- [ ] **Fixes #2-5**: Track tier distribution (target: 60-80% Tier 1, 20-40% Tier 2, 0-20% Tier 3)
- [ ] **Fixes #6-10**: Validate success rate (target: >70%), cost tracking (target: <$0.10 for 10 fixes)
- [ ] Document learnings in `docs/CONVERT-MY-FILE-LEARNINGS.md`

**Further Implementation Tasks**:
1. **If needed**: Threshold tuning based on first 10 fixes (see REMAINING-TASKS.md Task 2.7)
2. **Phase 3**: Deploy to NoteBridge and PaletteKit (repeat Phase 2 process)
3. **Cross-Extension Analysis**: Aggregate metrics across all 3 extensions
4. **Pattern Library Growth**: Monitor self-healing pattern accumulation (enabled in production)

**Reference**: See `docs/REMAINING-TASKS.md` for complete deployment checklist

### ⚙️ Feature Flag System

**Environment Variable**: `HOMEOSTAT_ENV` (controls self-healing pattern learning)

**Values**:
- `dev` / `test` → Pattern extraction/learning DISABLED (safe testing, returns null)
- `production` → Pattern extraction/learning ENABLED (learns from every successful fix)

**Why**: Allows safe testing while enabling pattern accumulation from day 1 of production. Pattern library starts empty, grows automatically in production. No "scramble in 6 months" - infrastructure is ready now, just flip the env var.

**Location**: Set in `.github/workflows/multi-repo-orchestrator.yml` (`env: HOMEOSTAT_ENV: production`)

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
- 230 tests (unit + integration + E2E + security + property)
- Security hardening (zero PII leaks validated)
- Benchmarking + cost tracking
- Structured logging, metrics, SLOs, alerts
- Complete documentation (7,584 lines)
- Release validation scripts

✅ **Phase 2 (Convert My File Deployment)**: COMPLETE (2025-10-28)
- GitHub Secrets configured (DEEPSEEK_API_KEY, OPENAI_API_KEY, HOMEOSTAT_PAT)
- Homeostat workflow installed (.github/workflows/homeostat.yml)
- Branch protection enabled with required status checks
- Circuit breaker labels created (hop:0-3, processing:homeostat, autofix:*)
- End-to-end pipeline tested and validated (issue #14)
- PAT authentication configured for private repository access
- Package-lock.json committed for reproducible CI builds

**Remaining**: Phase 3 - Deploy to NoteBridge and PaletteKit (see docs/REMAINING-TASKS.md)

## Key References

- **ENHANCEMENTS.md**: `~/claude-code-tools/ENHANCEMENTS.md`
- **Quick Reference**: `~/claude-code-tools/docs/QUICK-REFERENCE.md`
- **Subagents Guide**: `~/claude-code-tools/subagents/README.md`
