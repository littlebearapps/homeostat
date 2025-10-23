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
- `docs/IMPLEMENTATION-ROADMAP.md` - Complete Phase 0-5 implementation plan
- `docs/DEEPSEEK-MULTI-AI-ARCHITECTURE.md` - System architecture
- `docs/PRIVACY-SECURITY-GUIDE.md` - Security framework

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

**Date**: 2025-10-23
**Status**: Repository setup complete, ready for Phase 0 implementation
**Next Steps**: Begin Phase 0 (Privacy & Security) - 8-10 hours

## Implementation Phases

See `docs/IMPLEMENTATION-ROADMAP.md` for complete timeline:

- **Phase 0** (8-10 hours): Privacy & Security - PII sanitization, sensitive file routing, retry logic
- **Phase 1** (22-31 hours): Core Robot - Complexity analyzer, AI integration, test gating
- **Phase 2** (2-3 hours): NoteBridge Deployment
- **Phase 3** (4-6 hours): Rollout to other extensions

**Total**: 36-50 hours

## Key References

- **ENHANCEMENTS.md**: `~/claude-code-tools/ENHANCEMENTS.md`
- **Quick Reference**: `~/claude-code-tools/docs/QUICK-REFERENCE.md`
- **Subagents Guide**: `~/claude-code-tools/subagents/README.md`
