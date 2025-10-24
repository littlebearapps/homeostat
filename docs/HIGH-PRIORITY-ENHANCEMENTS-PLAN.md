# Homeostat High-Priority Enhancements - 1-Day Implementation Plan

**Status**: Ready for Implementation
**Created**: 2025-10-24
**Updated**: 2025-10-24 (Feature flag approach approved)
**GPT-5 Analysis**: Complete (via Zen MCP Deep Think)
**Estimated Effort**: 12-17 hours (Claude Code + Codex parallel work)
**Timeline**: 1 day

---

## Executive Summary (GPT-5 Deep Analysis - UPDATED with Feature Flag Approach)

**Recommendation**: Implement FULL self-healing loop with feature flag controls. Build everything now, enable learning in production only.

### Key Findings from GPT-5 Analysis

**Self-Healing Loop with Synthetic Patterns**: ❌ HIGH RISK (Original Analysis)
- Synthetic patterns could reduce success rate below current 75%
- No production data to validate pattern accuracy
- Maintenance burden of curating/fixing wrong patterns

**Feature Flag Approach**: ✅ SUPERIOR SOLUTION (Updated Recommendation)
- Build COMPLETE pattern learning system now
- Feature flag (`HOMEOSTAT_ENV`) controls pattern extraction behavior
- DEV/TEST mode: Pattern extraction DISABLED (safe testing)
- PROD mode: Pattern extraction ENABLED (learn from fix #1)
- Start learning immediately when extensions go live
- No "scramble in 6 months" to build infrastructure

**1-Day Implementation Plan**: ✅ THREE HIGH-VALUE ENHANCEMENTS
1. **Multi-Repository Support** (4-6 hours) - Immediate ROI for 3-extension rollout
2. **Self-Healing Loop with Feature Flag** (6-8 hours) - FULL implementation, controlled learning
3. **Enhanced Observability** (2-3 hours) - Better monitoring foundation

**Total Effort**: 12-17 hours (fits 1-day with Claude Code + Codex working in parallel)

---

## Priority 1: Multi-Repository Support (4-6 hours)

### Problem Being Solved
Currently: Each extension needs separate Homeostat installation (duplicate workflow files, maintenance 3x)
Future: Central Homeostat repo handles all 3 extensions from one workflow

### Implementation Overview

#### File 1: `.homeostat/repos.yml` (Central Configuration)
```yaml
version: 1
repositories:
  - slug: littlebearapps/convert-my-file
    branch: main
    max_prs_per_run: 2
    labels: [homeostat-fix, convert-my-file]
    path_filters:
      include: [src/, content/, background/]
      exclude: [tests/, docs/]

  - slug: littlebearapps/notebridge
    branch: main
    max_prs_per_run: 2
    labels: [homeostat-fix, notebridge]
    path_filters:
      include: [src/, content/, background/]
      exclude: [tests/, docs/]

  - slug: littlebearapps/palette-kit
    branch: main
    max_prs_per_run: 2
    labels: [homeostat-fix, palette-kit]
    path_filters:
      include: [src/, content/, background/]
      exclude: [tests/, docs/]
```

#### File 2: `homeostat/multi-repo/repo-manager.ts` (New)
```typescript
interface RepoConfig {
  slug: string;
  branch: string;
  maxPRsPerRun: number;
  labels: string[];
  pathFilters: { include: string[]; exclude: string[] };
}

export class RepoManager {
  constructor(private config: RepoConfig, private pat: string) {}

  async cloneShallow(): Promise<string> {
    // Clone with --depth=1 for speed
  }

  async hasExistingPR(fingerprint: string): Promise<boolean> {
    // Search for open PRs with same fingerprint
  }

  async createOrUpdatePR(params: {
    fingerprint: string;
    title: string;
    body: string;
    branchName: string;
  }): Promise<{ number: number; created: boolean }> {
    // Create new PR or update existing
  }

  async applyPathFilters(files: string[]): boolean {
    // Validate changed files match path filters
  }
}
```

#### File 3: `.github/workflows/multi-repo-orchestrator.yml` (New)
```yaml
name: Multi-Repo Homeostat

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

jobs:
  orchestrate:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        repo: [convert-my-file, notebridge, palette-kit]
      max-parallel: 1  # Serialize to avoid rate limits

    steps:
      - uses: actions/checkout@v4

      - name: Load Repo Config
        id: config
        run: |
          CONFIG=$(yq e '.repositories[] | select(.slug == "littlebearapps/${{ matrix.repo }}")' .homeostat/repos.yml)
          echo "config=$CONFIG" >> $GITHUB_OUTPUT

      - name: Clone Target Repo
        run: |
          git clone --depth=1 https://x-access-token:${{ secrets.HOMEOSTAT_PAT }}@github.com/littlebearapps/${{ matrix.repo }}.git target-repo

      - name: Run Homeostat
        run: |
          node homeostat/multi-repo/orchestrator.js \
            --repo ${{ matrix.repo }} \
            --config '${{ steps.config.outputs.config }}'
        env:
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.HOMEOSTAT_PAT }}
```

### Safety Rails
- **PR Budget**: Max 2 PRs per repo per run (prevent spam)
- **Path Filters**: Only touch specified directories (src/, content/, background/)
- **Idempotency**: Check for existing PRs before creating duplicates
- **Rate Limiting**: Serialize repo processing, exponential backoff on 429

### Acceptance Criteria
- ✅ One workflow run touches all 3 repos
- ✅ Creates max 1 PR per repo when eligible issue found
- ✅ Skips if PR already exists for same fingerprint
- ✅ Respects path filters (doesn't touch excluded directories)

---

## Priority 2: Self-Healing Loop (Full Implementation with Feature Flag) (6-8 hours)

### Problem Being Solved
Build the COMPLETE pattern learning system NOW with feature flag controls. This allows safe testing (learning disabled) while enabling immediate pattern accumulation from day 1 of production (learning enabled).

### GPT-5 Analysis Result
**Recommendation**: ✅ **Implement full self-healing loop with HOMEOSTAT_ENV feature flag**

**Why Feature Flag Approach Wins**:
- Eliminates "wait 6 months" delay
- Start learning from first production fix
- Safe testing with learning disabled
- No scramble when ready - just flip env var
- Infrastructure validated before production use

### Implementation Overview

#### File 1: `shared/patterns/fingerprinter.ts` (New)
```typescript
export interface ErrorFingerprint {
  id: string;  // Hash of normalized signature
  errorType: string;
  filePath: string;
  topStackFrame: string;
  messageHash: string;
  fullSignature: string;
}

export class FailureFingerprinter {
  static normalize(error: {
    type: string;
    message: string;
    stack: string;
  }): ErrorFingerprint {
    // Extract file path from stack
    const filePath = this.extractFilePath(error.stack);

    // Get top stack frame
    const topFrame = error.stack.split('\n')[0];

    // Hash message (remove dynamic parts like IDs, timestamps)
    const normalized = error.message
      .replace(/\d+/g, 'N')
      .replace(/[a-f0-9]{32}/g, 'HASH');

    const messageHash = crypto
      .createHash('sha256')
      .update(normalized)
      .digest('hex')
      .slice(0, 8);

    const signature = `${error.type}:${filePath}:${messageHash}`;
    const id = crypto.createHash('sha256').update(signature).digest('hex').slice(0, 12);

    return {
      id,
      errorType: error.type,
      filePath,
      topStackFrame: topFrame,
      messageHash,
      fullSignature: signature
    };
  }
}
```

#### File 2: `shared/patterns/attempt-store.ts` (New)
```typescript
export interface AttemptState {
  fingerprint: string;
  attempts: number;
  lastAttemptAt: string;
  backoffUntil: string;
  lastResult: 'success' | 'failure' | 'pending';
  prNumber?: number;
}

export class AttemptStore {
  private static MAX_ATTEMPTS = 3;
  private static COOLDOWN_HOURS = 24;

  static async load(fingerprint: string, githubAPI: GitHubAdapter): Promise<AttemptState | null> {
    // Read from PR comment state block or branch JSON
  }

  static async save(state: AttemptState, githubAPI: GitHubAdapter): Promise<void> {
    // Write to PR comment + branch sidecar JSON
  }

  static canAttempt(state: AttemptState | null): boolean {
    if (!state) return true;
    if (state.attempts >= this.MAX_ATTEMPTS) return false;
    if (new Date(state.backoffUntil) > new Date()) return false;
    return true;
  }

  static nextBackoff(attempts: number): Date {
    const hours = Math.pow(2, attempts) * this.COOLDOWN_HOURS;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }
}
```

#### File 3: `shared/patterns/matcher.ts` (New - FULL Implementation)
```typescript
import { readFileSync } from 'fs';
import { ErrorFingerprint } from './fingerprinter';

export interface PatternMatch {
  confidence: number;
  patternId: string;
  fixTemplate: string;
  successRate: number;
  useCount: number;
}

export interface FixPattern {
  id: string;
  fingerprint: ErrorFingerprint;
  fixTemplate: string;
  successRate: number;
  useCount: number;
  createdAt: string;
  lastUsedAt: string;
}

export class PatternMatcher {
  private static CONFIDENCE_THRESHOLD = 0.8;

  static async tryMatch(fingerprint: ErrorFingerprint): Promise<PatternMatch | null> {
    const library = this.loadLibrary();

    if (library.patterns.length === 0) {
      return null; // Empty during dev/test, grows in prod
    }

    // Try exact match first
    const exactMatch = library.patterns.find(
      p => p.fingerprint.id === fingerprint.id
    );

    if (exactMatch && exactMatch.successRate >= this.CONFIDENCE_THRESHOLD) {
      return {
        confidence: exactMatch.successRate,
        patternId: exactMatch.id,
        fixTemplate: exactMatch.fixTemplate,
        successRate: exactMatch.successRate,
        useCount: exactMatch.useCount
      };
    }

    // Try fuzzy match (same file + error type)
    const fuzzyMatches = library.patterns.filter(
      p => p.fingerprint.filePath === fingerprint.filePath &&
           p.fingerprint.errorType === fingerprint.errorType &&
           p.successRate >= this.CONFIDENCE_THRESHOLD
    );

    if (fuzzyMatches.length === 0) return null;

    // Return highest success rate
    const best = fuzzyMatches.reduce((a, b) =>
      a.successRate > b.successRate ? a : b
    );

    return {
      confidence: best.successRate * 0.8, // Reduce confidence for fuzzy match
      patternId: best.id,
      fixTemplate: best.fixTemplate,
      successRate: best.successRate,
      useCount: best.useCount
    };
  }

  private static loadLibrary(): { patterns: FixPattern[] } {
    try {
      const data = readFileSync('shared/patterns/library.json', 'utf-8');
      return JSON.parse(data);
    } catch {
      return { patterns: [] };
    }
  }
}
```

#### File 4: `shared/patterns/extractor.ts` (New - FULL Implementation with Feature Flag)
```typescript
import { writeFileSync, readFileSync } from 'fs';
import { ErrorFingerprint } from './fingerprinter';
import { FixPattern } from './matcher';
import { Logger } from '../logging/logger';

const logger = Logger.getInstance();

export interface PRData {
  number: number;
  diff: string;
  title: string;
  merged: boolean;
  fingerprint: ErrorFingerprint;
}

export class PatternExtractor {
  static async extractFromSuccessfulFix(pr: PRData): Promise<FixPattern | null> {
    // Feature flag check - only extract in production
    if (process.env.HOMEOSTAT_ENV !== 'production') {
      logger.info('Pattern extraction disabled (dev/test mode)', {
        prNumber: pr.number,
        env: process.env.HOMEOSTAT_ENV || 'dev'
      });
      return null;
    }

    // Validate PR was merged and successful
    if (!pr.merged) {
      logger.warn('Skipping pattern extraction - PR not merged', {
        prNumber: pr.number
      });
      return null;
    }

    // Extract fix template from diff
    const fixTemplate = this.extractTemplate(pr.diff);

    if (!fixTemplate) {
      logger.warn('Could not extract fix template from PR', {
        prNumber: pr.number
      });
      return null;
    }

    // Create new pattern
    const pattern: FixPattern = {
      id: `pattern-${pr.fingerprint.id}-${Date.now()}`,
      fingerprint: pr.fingerprint,
      fixTemplate,
      successRate: 1.0, // Initial confidence
      useCount: 0,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString()
    };

    // Add to library
    await this.addToLibrary(pattern);

    logger.info('Pattern extracted and added to library', {
      patternId: pattern.id,
      fingerprint: pr.fingerprint.id
    });

    return pattern;
  }

  private static extractTemplate(diff: string): string | null {
    // Simple heuristic: extract added lines (+)
    const addedLines = diff
      .split('\n')
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.substring(1).trim())
      .join('\n');

    if (addedLines.length < 10) return null; // Too small to be useful

    return addedLines;
  }

  private static async addToLibrary(pattern: FixPattern): Promise<void> {
    const library = this.loadLibrary();

    // Check for duplicates
    const exists = library.patterns.find(p => p.id === pattern.id);
    if (exists) {
      logger.warn('Pattern already exists in library', { patternId: pattern.id });
      return;
    }

    // Add pattern
    library.patterns.push(pattern);
    library.metadata.totalPatterns = library.patterns.length;
    library.metadata.lastUpdated = new Date().toISOString();

    // Save library
    writeFileSync(
      'shared/patterns/library.json',
      JSON.stringify(library, null, 2)
    );
  }

  private static loadLibrary(): any {
    try {
      const data = readFileSync('shared/patterns/library.json', 'utf-8');
      return JSON.parse(data);
    } catch {
      return {
        version: 1,
        patterns: [],
        metadata: {
          lastUpdated: new Date().toISOString(),
          totalPatterns: 0
        }
      };
    }
  }
}
```

#### File 5: `shared/patterns/learner.ts` (New - FULL Implementation with Feature Flag)
```typescript
import { writeFileSync, readFileSync } from 'fs';
import { Logger } from '../logging/logger';

const logger = Logger.getInstance();

export interface PRResult {
  patternId: string;
  merged: boolean;
  testsPassed: boolean;
  timestamp: string;
}

export class PatternLearner {
  private static MIN_SUCCESS_RATE = 0.5;
  private static MIN_USE_COUNT = 10;
  private static LEARNING_RATE = 0.1; // Exponential moving average alpha

  static async updateFromPRResult(result: PRResult): Promise<void> {
    // Feature flag check - only learn in production
    if (process.env.HOMEOSTAT_ENV !== 'production') {
      logger.info('Pattern learning disabled (dev/test mode)', {
        patternId: result.patternId,
        env: process.env.HOMEOSTAT_ENV || 'dev'
      });
      return;
    }

    const library = this.loadLibrary();
    const pattern = library.patterns.find(p => p.id === result.patternId);

    if (!pattern) {
      logger.warn('Pattern not found in library', {
        patternId: result.patternId
      });
      return;
    }

    // Update success rate with exponential moving average
    const success = result.merged && result.testsPassed ? 1 : 0;
    pattern.successRate =
      pattern.successRate +
      this.LEARNING_RATE * (success - pattern.successRate);

    pattern.useCount++;
    pattern.lastUsedAt = result.timestamp;

    logger.info('Pattern updated with PR result', {
      patternId: result.patternId,
      oldSuccessRate: pattern.successRate,
      newSuccessRate: pattern.successRate,
      useCount: pattern.useCount,
      merged: result.merged
    });

    // Retire low-performing patterns
    if (
      pattern.successRate < this.MIN_SUCCESS_RATE &&
      pattern.useCount >= this.MIN_USE_COUNT
    ) {
      await this.retirePattern(result.patternId, library);
      logger.warn('Pattern retired due to low success rate', {
        patternId: result.patternId,
        successRate: pattern.successRate,
        useCount: pattern.useCount
      });
    } else {
      // Save updated library
      this.saveLibrary(library);
    }
  }

  private static async retirePattern(
    patternId: string,
    library: any
  ): Promise<void> {
    library.patterns = library.patterns.filter(p => p.id !== patternId);
    library.metadata.totalPatterns = library.patterns.length;
    library.metadata.lastUpdated = new Date().toISOString();

    this.saveLibrary(library);
  }

  private static loadLibrary(): any {
    try {
      const data = readFileSync('shared/patterns/library.json', 'utf-8');
      return JSON.parse(data);
    } catch {
      return {
        version: 1,
        patterns: [],
        metadata: {
          lastUpdated: new Date().toISOString(),
          totalPatterns: 0
        }
      };
    }
  }

  private static saveLibrary(library: any): void {
    writeFileSync(
      'shared/patterns/library.json',
      JSON.stringify(library, null, 2)
    );
  }
}
```

#### File 6: `shared/patterns/library.json` (New - EMPTY, Will Grow in Production)
```json
{
  "version": 1,
  "patterns": [],
  "metadata": {
    "lastUpdated": "2025-10-24T00:00:00Z",
    "totalPatterns": 0,
    "note": "Pattern library starts empty. In PRODUCTION mode, patterns are extracted from successful PRs and learned from results."
  }
}
```

### Feature Flag Configuration

#### Environment Variable: `HOMEOSTAT_ENV`

**Valid Values**:
- `dev` (default) - Development mode
- `test` - Testing mode
- `production` - Production mode

**Behavior Matrix**:

| Component | dev/test | production |
|-----------|----------|------------|
| **PatternMatcher** | ✅ Active (returns null if empty library) | ✅ Active (returns matches if >80% confidence) |
| **PatternExtractor** | ❌ Disabled (logs only) | ✅ Active (extracts patterns from merged PRs) |
| **PatternLearner** | ❌ Disabled (logs only) | ✅ Active (updates success rates) |

**GitHub Actions Configuration**:
```yaml
# In .github/workflows/multi-repo-orchestrator.yml
env:
  HOMEOSTAT_ENV: production  # Enable learning in production
  DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

**Local Testing Configuration**:
```bash
# In your terminal for testing
export HOMEOSTAT_ENV=dev
npm test  # Pattern extraction disabled, safe testing
```

### Safety Mechanisms

1. **Confidence Threshold**: Only use patterns with ≥80% success rate
2. **Pattern Retirement**: Retire patterns with <50% success after 10+ uses
3. **Deduplication**: Check for existing patterns before adding
4. **Exponential Moving Average**: Gradual learning rate (α = 0.1)
5. **Kill Switch**: Set `HOMEOSTAT_ENV=dev` to disable all learning
6. **Empty Library Safety**: Matcher returns null if library is empty (dev/test guaranteed safe)

### Integration into Orchestrator
```typescript
// In orchestrator.ts, add before AI tier selection:
import { FailureFingerprinter } from '../shared/patterns/fingerprinter';
import { AttemptStore } from '../shared/patterns/attempt-store';
import { PatternMatcher } from '../shared/patterns/matcher';
import { PatternExtractor } from '../shared/patterns/extractor';
import { PatternLearner } from '../shared/patterns/learner';

// Step 1: Fingerprint the error
const fingerprint = FailureFingerprinter.normalize(error);

// Step 2: Check attempt state (cooldown logic)
const attemptState = await AttemptStore.load(fingerprint.id, githubAPI);

if (!AttemptStore.canAttempt(attemptState)) {
  logger.info('Fingerprint in cooldown', { fingerprint: fingerprint.id });
  return { skipped: true, reason: 'cooldown' };
}

// Step 3: Try pattern matching (zero-cost fix)
const patternMatch = await PatternMatcher.tryMatch(fingerprint);
if (patternMatch && patternMatch.confidence > 0.8) {
  logger.info('Pattern match found - using zero-cost fix', {
    patternId: patternMatch.patternId,
    confidence: patternMatch.confidence
  });

  // Apply pattern fix without AI
  const pr = await applyPatternFix(patternMatch, githubAPI);

  // Learn from result (feature flag controlled)
  await PatternLearner.updateFromPRResult({
    patternId: patternMatch.patternId,
    merged: pr.merged,
    testsPassed: pr.testsPassed,
    timestamp: new Date().toISOString()
  });

  return { source: 'pattern', pr };
}

// Step 4: Fallback to existing AI tier logic
const tierConfig = selectModel(error);
const fix = await attemptFix(tierConfig, error);

// Step 5: Extract pattern from successful AI fix (feature flag controlled)
if (fix.pr.merged) {
  await PatternExtractor.extractFromSuccessfulFix({
    number: fix.pr.number,
    diff: fix.pr.diff,
    title: fix.pr.title,
    merged: fix.pr.merged,
    fingerprint
  });
}

return fix;
```

### Acceptance Criteria
- ✅ Fingerprinting generates consistent IDs for same error
- ✅ Attempt state persists across workflow runs (PR comments + branch JSON)
- ✅ Cooldown prevents infinite retry loops (24h backoff, max 3 attempts)
- ✅ Pattern matcher works in all environments (returns null if empty library)
- ✅ Pattern extractor respects feature flag (disabled in dev/test, enabled in prod)
- ✅ Pattern learner respects feature flag (disabled in dev/test, enabled in prod)
- ✅ Infrastructure doesn't break existing AI flow (all additive)
- ✅ Tests validate feature flag behavior in dev/test modes
- ✅ Zero-cost pattern fixes work when patterns exist (>80% confidence)
- ✅ Low-performing patterns retired automatically (<50% after 10 uses)

---

## Priority 3: Enhanced Observability (2-3 hours) - If Time Permits

### File 1: Structured Workflow Summary
```yaml
# Add to end of multi-repo-orchestrator.yml
- name: Generate Summary
  if: always()
  run: |
    cat > $GITHUB_STEP_SUMMARY << EOF
    ## Homeostat Multi-Repo Run

    | Repo | Issues Processed | PRs Created | PRs Updated | Fingerprints Cooled Down |
    |------|------------------|-------------|-------------|--------------------------|
    | convert-my-file | ${{ steps.cmf.outputs.processed }} | ${{ steps.cmf.outputs.created }} | ${{ steps.cmf.outputs.updated }} | ${{ steps.cmf.outputs.cooldown }} |
    | notebridge | ${{ steps.nb.outputs.processed }} | ${{ steps.nb.outputs.created }} | ${{ steps.nb.outputs.updated }} | ${{ steps.nb.outputs.cooldown }} |
    | palette-kit | ${{ steps.pk.outputs.processed }} | ${{ steps.pk.outputs.created }} | ${{ steps.pk.outputs.updated }} | ${{ steps.pk.outputs.cooldown }} |

    **Total Cost**: \$${{ steps.cost.outputs.total }}
    **Total Tokens**: ${{ steps.cost.outputs.tokens }}
    EOF
```

### File 2: JSONL Artifacts
```typescript
// In orchestrator, write after each repo run:
const artifact = {
  timestamp: new Date().toISOString(),
  repo: repoSlug,
  fingerprintsProcessed: fingerprints.map(f => f.id),
  prsCreated: createdPRs.length,
  prsUpdated: updatedPRs.length,
  cooldowns: cooldownCount,
  cost: costTracker.getTotalCost(),
  tokens: costTracker.getTotalTokens(),
  latency: endTime - startTime
};

fs.appendFileSync(
  `artifacts/run-${Date.now()}.jsonl`,
  JSON.stringify(artifact) + '\n'
);
```

### File 3: Enhanced PR Template
```markdown
## 🤖 Homeostat Auto-Fix

**Fingerprint**: `{fingerprint.id}`
**Error Type**: {error.type}
**File**: {error.filePath}
**Attempt**: {attemptState.attempts + 1}/{MAX_ATTEMPTS}

### What Changed
{patchSummary}

### Reproduction
\`\`\`bash
# To reproduce this error:
{reproductionSteps}
\`\`\`

### Stack Trace Summary
\`\`\`
{sanitizedStack}
\`\`\`

### Homeostat State
\`\`\`json
{
  "fingerprint": "{fingerprint.id}",
  "attempts": {attemptState.attempts + 1},
  "lastAttemptAt": "{new Date().toISOString()}",
  "backoffUntil": "{nextBackoff.toISOString()}",
  "tier": {tierUsed},
  "cost": "${fixCost}"
}
\`\`\`

### How to Opt-Out
Add label `do-not-fix` to the original issue to prevent future attempts.

---
*Generated by Homeostat v1.0.0*
```

---

## What NOT to Implement (Critical)

### ❌ DO NOT Build Pattern Library with Synthetic Data

**Why Not**:
- Risk of false patterns reducing success rate
- Maintenance burden of curating synthetic patterns
- No way to validate accuracy without production data
- Could introduce bugs in working system

**Decision**: Pattern library starts EMPTY, but FULL extraction/learning infrastructure is built now with feature flag. When `HOMEOSTAT_ENV=production`, the system will automatically start learning from real production fixes. No synthetic data used.

### ❌ DO NOT Implement Canary Deployment Yet

**Why Not**:
- Requires Chrome extension distribution infrastructure
- Needs real-time error rate monitoring from Logger
- Complex rollback logic not validated
- Not needed for initial 3-extension rollout

**Decision**: Canary code exists as stub, full implementation deferred

### ❌ DO NOT Add Slack Integration Yet

**Why Not**:
- Low ROI (convenience only)
- GitHub Actions summaries sufficient for now
- Can add later in 2-3 hours if needed

**Decision**: Skip unless time remaining after P1+P2

---

## Implementation Sequence

### Hour 0-1: Setup & Planning
- Review this plan with user
- Create feature branch: `feature/high-priority-enhancements`
- Set up Codex + Claude Code coordination strategy

### Hour 1-3: Multi-Repository Support (Codex)
**Codex Focus**: Build multi-repo infrastructure
- Create `.homeostat/repos.yml` config
- Implement `RepoManager` class
- Create multi-repo orchestrator workflow
- Write tests for repo manager

### Hour 3-5: Multi-Repository Testing (Claude Code)
**Claude Code Focus**: Validate multi-repo system
- Integration tests with 3 repos
- Test PR deduplication
- Validate path filters
- Test rate limiting

### Hour 5-9: Self-Healing Loop (FULL Implementation) (Codex)
**Codex Focus**: Build complete pattern learning system with feature flag
- Implement `FailureFingerprinter` (error normalization)
- Implement `AttemptStore` with state persistence (cooldown logic)
- Implement FULL `PatternMatcher` (exact + fuzzy matching)
- Implement FULL `PatternExtractor` (with feature flag check)
- Implement FULL `PatternLearner` (with feature flag check)
- Create empty `library.json` with documentation
- Add feature flag configuration to GitHub Actions workflow

### Hour 9-11: Self-Healing Testing (Claude Code)
**Claude Code Focus**: Validate complete pattern learning system
- Unit tests for fingerprinting (consistent ID generation)
- Integration tests for attempt store (state persistence)
- Test cooldown logic (24h backoff, max 3 attempts)
- Test feature flag behavior (dev/test mode disables extraction/learning)
- Test pattern matching (exact + fuzzy matching)
- Test pattern extraction (only in production mode)
- Test pattern learning (only in production mode)
- Test pattern retirement (low success rate cleanup)
- Verify no breakage of existing AI flow (all additive)

### Hour 11-13: Observability (Both)
- Enhanced GitHub Actions summaries
- JSONL artifacts
- Improved PR templates
- Documentation updates

### Hour 13-17: Integration & Validation
- End-to-end testing with all 3 enhancements
- Validate feature flag behavior across all environments
- Test zero-cost pattern fixes (with mock patterns)
- Test pattern extraction from successful PRs
- Test pattern learning from PR results
- Update CLAUDE.md and README.md
- Update FUTURE-ENHANCEMENTS.md (mark completed)
- Create PR with comprehensive description

---

## Acceptance Criteria (Final Validation)

### Multi-Repository Support
- [ ] One workflow run processes all 3 repos (convert-my-file, notebridge, palette-kit)
- [ ] Creates max 2 PRs per repo per run
- [ ] Skips if PR already exists for same fingerprint
- [ ] Path filters work (only touches src/, content/, background/)
- [ ] Rate limiting prevents GitHub API 429 errors

### Self-Healing Loop (Full Implementation with Feature Flag)
- [ ] Fingerprinting generates consistent IDs for same error
- [ ] Attempt state persists in PR comments + branch JSON
- [ ] Cooldown prevents retries within 24 hours (24h backoff)
- [ ] Max 3 attempts enforced per fingerprint
- [ ] **Pattern matcher works in all environments** (returns null if empty library)
- [ ] **Pattern extractor respects feature flag** (disabled in dev/test, enabled in prod)
- [ ] **Pattern learner respects feature flag** (disabled in dev/test, enabled in prod)
- [ ] **Feature flag behavior tested** (dev/test disables extraction/learning)
- [ ] **Zero-cost pattern fixes work** when patterns exist (>80% confidence)
- [ ] **Low-performing patterns retired** automatically (<50% after 10 uses)
- [ ] **Pattern extraction from successful PRs** (when merged in prod)
- [ ] **Pattern learning from PR results** (exponential moving average)
- [ ] Existing AI flow still works (no regressions, all additive)

### Observability
- [ ] GitHub Actions summary shows per-repo stats
- [ ] JSONL artifacts include cost, tokens, latency
- [ ] PR template includes fingerprint, state, opt-out instructions

### Documentation
- [ ] CLAUDE.md updated with new features
- [ ] README.md lists new capabilities
- [ ] FUTURE-ENHANCEMENTS.md marks P1+P2 as complete
- [ ] New docs created: `docs/MULTI-REPO-GUIDE.md`, `docs/FINGERPRINTING.md`

---

## Post-Implementation

### Update FUTURE-ENHANCEMENTS.md
Mark as complete:
- ✅ Enhancement 5: Multi-Repository Support
- ✅ Enhancement 4: Self-Healing Loop Infrastructure (patterns deferred)

Update priorities:
- Pattern extraction: Remains deferred until 6+ months production data
- Canary deployment: Remains deferred until 100+ fixes
- Slack integration: Can implement in 2-3 hours if needed

### Update REMAINING-TASKS.md
Simplify Phase 2 deployment:
- Extension repos no longer need individual workflow files
- Only need to configure GitHub Secrets
- Central workflow handles all repos

---

## Success Metrics (6 Months)

After production deployment, validate:
- **Multi-repo efficiency**: 1 workflow update vs 3 repo updates = 66% time savings
- **Fingerprinting accuracy**: >95% of duplicate errors matched to same fingerprint
- **Cooldown effectiveness**: <5% of fingerprints hit max attempts
- **Pattern readiness**: Infrastructure ready when data becomes available

---

## Files to Create/Modify

### New Files (10 - Updated for Feature Flag Approach)
1. `.homeostat/repos.yml` - Multi-repo config
2. `homeostat/multi-repo/repo-manager.ts` - Repo management
3. `homeostat/multi-repo/orchestrator.ts` - Multi-repo orchestrator
4. `.github/workflows/multi-repo-orchestrator.yml` - Central workflow
5. `shared/patterns/fingerprinter.ts` - Error fingerprinting (always active)
6. `shared/patterns/attempt-store.ts` - State management (always active)
7. `shared/patterns/matcher.ts` - **FULL pattern matching** (always active, returns null if empty)
8. `shared/patterns/extractor.ts` - **FULL pattern extraction** (feature flag controlled)
9. `shared/patterns/learner.ts` - **FULL pattern learning** (feature flag controlled)
10. `shared/patterns/library.json` - Empty pattern library (grows in production)

### Modified Files (4)
1. `homeostat/orchestrator.ts` - Add fingerprinting + attempt store
2. `CLAUDE.md` - Document new features
3. `README.md` - List new capabilities
4. `docs/FUTURE-ENHANCEMENTS.md` - Mark P1+P2 complete

### New Documentation (2)
1. `docs/MULTI-REPO-GUIDE.md` - Multi-repo setup guide
2. `docs/FINGERPRINTING.md` - Fingerprinting technical details

---

**Total Estimated Effort**: 12-17 hours with Claude Code + Codex working in parallel
**Timeline**: 1 day
**Risk**: Low (no breaking changes, all additive features, feature flag provides kill switch)

---

## GPT-5 Expert Validation Summary (UPDATED with Feature Flag Approach)

**Analysis Method**: Zen MCP Deep Think with max thinking mode
**Confidence**: Very High
**Final Recommendation**: Build FULL self-healing loop with feature flag controls

### Original Analysis (Synthetic Patterns)
**Key Recommendation**: ❌ Do NOT use synthetic patterns
> "Don't build a complex rules engine or pattern library now. Stub a simple strategy interface and defer pattern curation until you have real fingerprints."

**Concerns**:
- Synthetic patterns could reduce success rate
- No production data to validate accuracy
- Maintenance burden of curating wrong patterns

### Updated Analysis (Feature Flag Approach)
**Key Recommendation**: ✅ Implement FULL system with HOMEOSTAT_ENV feature flag

**Critical Insight from GPT-5**:
> "Feature flag approach is SUPERIOR to skeleton-only approach. Build everything now with learning disabled in dev/test, enabled in production. This eliminates the 6-month delay and ensures infrastructure is battle-tested before learning begins. No scramble when ready - just flip the env var."

**Validated Approach**:
1. **Multi-repo support** (4-6 hours): Immediate high ROI (66% maintenance reduction)
2. **Self-healing loop with feature flag** (6-8 hours): FULL implementation, controlled learning
   - Pattern extraction: Feature flag controlled (prod only)
   - Pattern learning: Feature flag controlled (prod only)
   - Pattern matching: Always active (returns null if empty)
   - Safety: Empty library in dev/test, grows in prod
3. **Enhanced observability** (2-3 hours): Better monitoring foundation

**Why Feature Flag Wins**:
- ✅ Start learning from fix #1 (no 6-month delay)
- ✅ Safe testing with learning disabled
- ✅ Infrastructure validated before production use
- ✅ Kill switch available (toggle env var)
- ✅ No rush to build later - already deployed

---

**Last Updated**: 2025-10-24 (Feature flag approach approved)
**Ready for**: Implementation with Claude Code + Codex
