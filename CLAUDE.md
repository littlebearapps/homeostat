# CLAUDE.md - Homeostat

## Overview
Homeostat is an agentic fix pipeline that restores your repo to a steady, healthy state. Uses multi-tier AI (DeepSeek V3.2-Exp + GPT-5) to automatically detect, analyze, and repair bugs across multiple platforms.

**Annual Cost**: $9.28/year (1,000 fixes with retry logic)
**Target Platforms**:
- Chrome Extensions: NoteBridge, PaletteKit, ConvertMyFile
- WordPress Plugins: WP Navigator Pro, WP Navigator Lite
- VPS Tools: Brand Copilot, Auditor Toolkit
**Architecture**: 3-tier privacy-first system with dual parser (extensions + servers)

## Key Files
- `CLAUDE.md` - This file
- `.claude-context` - Session state
- `AGENTS.md` - AI agent coordination
- `README.md` - Project documentation
- `docs/ROADMAP.md` - **Complete v2-v4 product roadmap (ALL future ideas organized)** ⭐⭐⭐
- `docs/NEXT-STEPS.md` - **Testing, deployment, and validation guide (START HERE)** ⭐
- `docs/REMAINING-TASKS.md` - **Phase 2-3 deployment checklist**
- `docs/API-MANAGEMENT-PLAN.md` - **API cost management plan (GPT-5 validated, 4-week rollout)** 💰
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
- **Title**: `[ProductName] ErrorType: Error message`
- **Labels**: `robot` (required), `source:wordpress|vps|cloakpipe` (for routing)
- **Body Format**:
  - Extensions: Section format (`## Error Details`, `## Stack Trace`, `## Breadcrumbs`)
  - Servers: Section + bullet format (`## Error Details` with `- Field: value`)

**WordPress/VPS Format** (section + bullets):
```markdown
## Error Details
- Product: wp-navigator-pro v2.0.0
- Error Type: PDOException
- Message: Database connection failed
- Fingerprint: abc123
- Occurrences: 3/3

## Stack Trace
(code block)
```

**Extension Format** (sections):
```markdown
## Error Details
- Extension: NoteBridge v1.2.0
- Error Type: TypeError
- Fingerprint: def456

## Stack Trace
(code block)

## Breadcrumbs
1. User action
```

**Parser Routing**:
- `source:wordpress` → parseServerIssue() (bullet format)
- `source:vps` → parseServerIssue() (bullet format)
- `source:cloakpipe` or default → parseExtensionIssue() (section format)

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

**Date**: 2025-10-31
**Status**: ✅ **PRODUCTION OPERATIONAL - CLOAKPIPE INTEGRATION VALIDATED**
**Test Results**: 230/230 tests passing (100%)
**Coverage**: 97.9%-100% on all critical modules
**Projected Cost**: $5.77-$6.99/year (38% under $9.28 target)
**New Capabilities**:
- ✅ Multi-repository support (central orchestrator + repo manager)
- ✅ Self-healing loop with feature flag (fingerprinting, pattern learning, cooldown store)
- ✅ Enhanced observability (summaries, JSONL telemetry, safety guardrails)
- ✅ **Atomic circuit breaker locking** (ETag-based, prevents duplicate PRs from concurrent triggers)
- ✅ **CloakPipe → Homeostat integration** (automatic error processing from production)

**Latest**:
- ✅ **YAML Syntax Fix** (2025-10-31) - Resolved workflow parse-time failure
  - Fixed multi-line PR body formatting in fix-error.yml
  - Workflow now executes successfully (validated with test issue #68)
  - Commit d7c7f61 in `.github` org repository
- ✅ **CloakPipe Integration Test** (2025-10-31) - END-TO-END VALIDATION COMPLETE
  - Automatic trigger on `robot` label: ✅ Working
  - Issue parsing (CloakPipe format): ✅ Working
  - Complexity analysis and tier routing: ✅ Working (Tier 2)
  - Tier execution pipeline: ✅ Working
  - Circuit breaker (hop count): ✅ Working
  - Error reporting to issue: ✅ Working
  - Test run: https://github.com/littlebearapps/auditor-toolkit/actions/runs/18963352374

**Next Steps**: See sections below

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

### API Cost Management Plan

**Status**: ✅ **COMPLETE** - Phase 1A Deployed (2025-10-29)
**PR**: #7 - https://github.com/littlebearapps/homeostat/pull/7
**Document**: `docs/API-MANAGEMENT-PLAN.md` (48 KB, original plan with central state)

**Architecture Decision** (2025-10-29, GPT-5 validated):
- **Chosen**: Enhanced per-repo approach (Approach C from plan)
- **Rationale**: 95% risk reduction for 50% effort (per-repo caps: $72/year vs global cap: $36/year = only 2.5% delta)
- **Implementation**: Per-repo git-persisted state (no central repository needed)

**Phase 1A Complete** (6 hours actual):
- ✅ Per-repo budget tracking (git commit/push to `.homeostat/state/`)
- ✅ Dual-window rate limiting (1min burst: 5 attempts, 24h throughput: 20 attempts)
- ✅ Reservation/refund pattern (pre-flight protection)
- ✅ Workflow concurrency groups (prevent races without complex locking)
- ✅ Per-repo caps: $0.066/day ($24/year hard cap each)
- ✅ 61 unit tests (100% passing, 100% coverage on new modules)
- ✅ Management tools (`npm run budget:status`, `ratelimit:status`, etc.)

**Usage**:
```bash
npm run budget:status       # Check budget across all periods
npm run budget:reset        # Manual reset (with confirmation)
npm run ratelimit:status    # Check rate limit windows
npm run ratelimit:reset     # Manual reset (with confirmation)
```

**State Files** (git-persisted in production):
- `.homeostat/state/budget.json` - Budget tracking (daily/weekly/monthly)
- `.homeostat/state/rate_limiter.json` - Rate limit timestamps

**Upgrade Criteria** (monitor for 2-4 weeks):
- 3+ concurrent spike incidents across repos within 30 days, OR
- Org-wide spend ≥ $0.20/day observed 5+ times in 30 days, OR
- Need for budget pool sharing across repos

**If Issues Occur**:
1. Check `.homeostat/state/budget.json` for current spend/caps
2. Review workflow logs for budget blocks or rate limit hits
3. Verify workflow concurrency group working (no concurrent runs)
4. If concurrent multi-repo spikes observed, consider upgrading to central state (see `docs/API-MANAGEMENT-PLAN.md` Approach A)

**Reference**: See `docs/API-MANAGEMENT-PLAN.md` for full context and central state migration path.

### Further Implementation Tasks

1. **API Management Phase 1A**: ✅ Complete (deployed 2025-10-29, PR #7)
2. **API Management Phase 1B**: ⏸️ Optional - Alerting & Reporting (deferred, see below)
3. **Phase 3 Deployment**: Deploy to NoteBridge and PaletteKit (see `docs/REMAINING-TASKS.md`)
4. **Threshold Tuning**: Adjust based on first 10 fixes if needed (see `docs/REMAINING-TASKS.md` Task 2.7)
5. **Cross-Extension Analysis**: Aggregate metrics across all 3 extensions
6. **Pattern Library Growth**: Monitor self-healing pattern accumulation (enabled in production)

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
