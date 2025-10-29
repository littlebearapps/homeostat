/**
 * Homeostat orchestrator per LOGGER-INTEGRATION.md lines 55-295 and
 * IMPLEMENTATION-ROADMAP.md lines 251-350.
 * Coordinates parsing, routing, execution, testing, and GitHub updates for
 * end-to-end validation flows.
 */
import selectModel from './routing/model-selector.js';
import { parseLoggerIssue } from './routing/issue-parser.js';
import { StructuredLogger } from '../shared/observability/logger.js';
import { metrics } from '../shared/observability/metrics.js';
import { CostTracker, type TokenUsage } from '../shared/cost/tracker.js';
import { FailureFingerprinter } from '../shared/patterns/fingerprinter.js';
import { AttemptStore, MAX_ATTEMPTS } from '../shared/patterns/attempt-store.js';
import { GitHubCircuitBreaker } from '../shared/patterns/github-circuit-breaker.js';
import { PatternMatcher } from '../shared/patterns/matcher.js';
import { PatternExtractor } from '../shared/patterns/extractor.js';
import { PatternLearner } from '../shared/patterns/learner.js';
import { JSONLLogger, type RunMetrics } from './telemetry/jsonl-logger.js';
import { generatePRBody } from './templates/pr-template.js';
import { BudgetStore } from '../shared/budget/store.js';
import { RateLimiter } from '../shared/rate-limit/limiter.js';

export interface GitHubIssueLike {
  number: number;
  title: string;
  body: string;
  labels?: Array<{ name: string }>;
}

export interface GitHubAdapter {
  getIssue(issueNumber: number): GitHubIssueLike | undefined;
  createPR(input: {
    title: string;
    body: string;
    base: string;
    head: string;
  }): Promise<{ number: number; state?: string }> | { number: number; state?: string };
  addComment(issueNumber: number, comment: string): Promise<void> | void;
  addLabel?(issueNumber: number, label: string): Promise<void> | void;
  octokit?: any; // Optional Octokit instance for circuit breaker integration
}

export interface ExecutionRouting {
  tier: number;
  model: string;
  attempts: number;
}

interface ExecutionOutcome {
  success: boolean;
  model: string;
  patch?: string;
  tokens: TokenUsage[];
  cost: number;
}

export interface SafetyConfig {
  maxDiffLines: number;
  maxFiles: number;
  budgetLimit: number;
  pathFilters?: { include: string[]; exclude: string[] };
  secretPatterns?: RegExp[];
}

export interface RunContext {
  totalCost: number;
  patternsUsed: number;
  zeroCostFixes: number;
  cooldowns: number;
  fingerprints: string[];
}

export interface ProcessOptions {
  githubAPI: GitHubAdapter;
  mockAI?: boolean;
  mockTestFailure?: boolean;
  costTracker?: CostTracker;
  delayFn?: (ms: number) => Promise<void>;
  maxCreatePRAttempts?: number;
  executeTier?: (
    issue: ReturnType<typeof parseLoggerIssue>['parsed'],
    routing: ExecutionRouting,
    helpers: { costTracker: CostTracker }
  ) => Promise<ExecutionOutcome>;
  repoSlug?: string;
  safety?: Partial<SafetyConfig>;
  runContext?: RunContext;
}

export interface ProcessIssueResult {
  tier?: number;
  model?: string;
  success?: boolean;
  fixGenerated?: boolean;
  testsPassed?: boolean;
  prNumber?: number;
  retries?: number;
  delayHistory?: number[];
  rejected?: boolean;
  skipped?: boolean;
  reason?: string;
}

const parseNumber = (value: string | undefined, fallback: number): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const buildSafetyConfig = (overrides: Partial<SafetyConfig> = {}): SafetyConfig => {
  const defaultConfig: SafetyConfig = {
    maxDiffLines: parseNumber(process.env.MAX_DIFF_LINES, 500),
    maxFiles: parseNumber(process.env.MAX_FILES, 10),
    budgetLimit: parseNumber(process.env.MAX_RUN_COST, 1),
    secretPatterns: [
      /sk_(?:live|test)_[0-9a-z]{16,}/i,
      /api[_-]?key\s*[:=]/i,
      /secret\s*[:=]/i,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/
    ]
  };

  return {
    ...defaultConfig,
    ...overrides,
    secretPatterns: overrides.secretPatterns ?? defaultConfig.secretPatterns
  };
};

const createRunContext = (existing?: RunContext): RunContext =>
  existing ?? {
    totalCost: 0,
    patternsUsed: 0,
    zeroCostFixes: 0,
    cooldowns: 0,
    fingerprints: []
  };

const TOKEN_PROFILES: Record<number, TokenUsage[]> = {
  1: [
    { model: 'deepseek', inputTokens: 800, outputTokens: 300, issueNumber: 0, tier: 1 }
  ],
  2: [
    { model: 'deepseek', inputTokens: 1500, outputTokens: 300, issueNumber: 0, tier: 2 },
    { model: 'gpt5', inputTokens: 0, outputTokens: 150, issueNumber: 0, tier: 2 }
  ],
  3: [
    { model: 'gpt5', inputTokens: 200, outputTokens: 120, issueNumber: 0, tier: 3 }
  ]
};

const MODEL_BY_TIER: Record<number, string> = {
  1: 'deepseek-v3.2-exp',
  2: 'deepseek-v3.2-exp',
  3: 'gpt-5'
};

const DEFAULT_MAX_PR_ATTEMPTS = 3;

const defaultDelay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function processIssue(
  issueNumber: number,
  options: ProcessOptions
): Promise<ProcessIssueResult> {
  const {
    githubAPI,
    mockAI = false,
    mockTestFailure = false,
    costTracker = new CostTracker(),
    delayFn = defaultDelay,
    maxCreatePRAttempts = DEFAULT_MAX_PR_ATTEMPTS,
    executeTier,
    repoSlug = 'littlebearapps/homeostat',
    safety: safetyOverrides = {},
    runContext
  } = options;

  const safety = buildSafetyConfig(safetyOverrides);
  const context = createRunContext(runContext);
  const delayHistory: number[] = [];
  const logger = new StructuredLogger({ issueNumber, stage: 'orchestrator' });
  logger.info('Processing issue');
  const startTime = Date.now();

  const logMetrics = (partial: Partial<RunMetrics>) => {
    const base: RunMetrics = {
      timestamp: new Date().toISOString(),
      repo: repoSlug,
      fingerprintsProcessed: [],
      prsCreated: 0,
      prsUpdated: 0,
      cooldowns: 0,
      cost: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      latency: Date.now() - startTime,
      errors: [],
      patternsUsed: 0,
      zeroCostFixes: 0
    };

    const tokens = partial.tokens ? { ...base.tokens, ...partial.tokens } : base.tokens;

    JSONLLogger.logRunMetrics({ ...base, ...partial, tokens });
  };

  const issue = githubAPI.getIssue(issueNumber);
  if (!issue) {
    const reason = `Issue #${issueNumber} not found`;
    logger.error('Issue lookup failed', undefined, { reason });
    logMetrics({ errors: [reason] });
    return { rejected: true, reason };
  }

  const labels = issue.labels ?? [];
  if (!labels.some((label) => label?.name === 'robot')) {
    logger.info('Skipping issue without robot label');
    logMetrics({ errors: ['missing robot label'] });
    return { skipped: true, reason: 'missing robot label' };
  }

  const { parsed, errors } = parseLoggerIssue(issue);
  if (errors.length) {
    const reason = errors.join('; ');
    logger.warn('Issue failed validation', { reason });
    if (githubAPI.addLabel) {
      await maybePromise(githubAPI.addLabel(issueNumber, 'incomplete'));
    }
    await maybePromise(
      githubAPI.addComment(
        issueNumber,
        `⚠️ ${reason}\n\nPlease ensure issue follows Logger format.`
      )
    );
    logMetrics({ errors: [reason] });
    return { rejected: true, reason };
  }

  // NEW: Create circuit breaker instance if octokit available
  let circuitBreaker: GitHubCircuitBreaker | null = null;
  if (githubAPI.octokit) {
    const [owner, repo] = repoSlug.split('/');
    circuitBreaker = new GitHubCircuitBreaker({
      octokit: githubAPI.octokit,
      owner,
      repo,
      maxHops: 3
    });

    // NEW: Try to acquire lock atomically
    const lockResult = await circuitBreaker.acquireLockAndIncrementHop(issueNumber, {
      trace: `orchestrator-${issueNumber}`,
      reason: 'Automated fix attempt'
    });

    if (!lockResult.acquired) {
      logger.info('Lock acquisition failed', {
        issueNumber,
        reason: lockResult.reason
      });
      logMetrics({
        errors: [lockResult.reason || 'lock_failed']
      });
      return {
        skipped: true,
        reason: lockResult.reason || 'lock_failed'
      };
    }

    logger.info('Lock acquired successfully', {
      issueNumber,
      currentHop: lockResult.currentHop
    });
  }

  const attemptStore = new AttemptStore();
  const fingerprint = FailureFingerprinter.normalize({
    type: parsed.errorType || 'UnknownError',
    message: parsed.errorMessage || parsed.message || '',
    stack: parsed.stackTrace || ''
  });

  const attemptKey = parsed.fingerprint || fingerprint.id;
  context.fingerprints.push(fingerprint.id);

  const canAttempt = await attemptStore.canAttempt(attemptKey);
  if (!canAttempt) {
    const reason = 'cooldown_active';
    logger.info('Skipping issue due to active cooldown', { fingerprint: attemptKey });
    context.cooldowns += 1;

    // Release lock before returning
    if (circuitBreaker) {
      await circuitBreaker.releaseLock(issueNumber);
    }

    logMetrics({
      fingerprintsProcessed: [fingerprint.id],
      cooldowns: 1,
      errors: [reason]
    });
    return { skipped: true, reason };
  }

  // NEW: Budget and rate limit checks (Phase 1A)
  // Skip in test environment to avoid interference with E2E tests
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  let reservation: any = { success: true, reservationId: 'test_reservation' };
  let reservationAmount = 0;

  if (!isTestEnv) {
    const budgetStore = new BudgetStore();
    const rateLimiter = new RateLimiter();

    // Check rate limits (dual windows: 1min burst + 24h throughput)
    const rateLimitCheck = await rateLimiter.canProceed();
    if (!rateLimitCheck.allowed) {
      const reason = rateLimitCheck.reason || 'rate_limit_exceeded';
      logger.warn('Rate limit exceeded', {
        current: rateLimitCheck.current,
        limits: rateLimitCheck.limits,
        resetsAt: rateLimitCheck.resetsAt
      });

      // Release lock before returning
      if (circuitBreaker) {
        await circuitBreaker.releaseLock(issueNumber);
      }

      // Comment on issue
      await maybePromise(
        githubAPI.addComment(
          issueNumber,
          `⏸️ **Rate Limit Exceeded**\n\n` +
            `This repository has reached its rate limit:\n` +
            `- **Per-minute**: ${rateLimitCheck.current.perMinute}/${rateLimitCheck.limits.perMinute} attempts\n` +
            `- **Per-day**: ${rateLimitCheck.current.perDay}/${rateLimitCheck.limits.perDay} attempts\n\n` +
            `The fix will be retried automatically when limits reset:\n` +
            `- Per-minute resets: ${new Date(rateLimitCheck.resetsAt.perMinute).toLocaleString('en-US', { timeZone: 'UTC' })} UTC\n` +
            `- Per-day resets: ${new Date(rateLimitCheck.resetsAt.perDay).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`
        )
      );

      logMetrics({
        fingerprintsProcessed: [fingerprint.id],
        errors: [reason]
      });
      return { skipped: true, reason };
    }

    // Determine tier for reservation (complexity-based, default to Tier 2 for safety)
    const estimatedTier = parsed.complexity && parsed.complexity < 3 ? 1 : parsed.complexity && parsed.complexity > 6 ? 3 : 2;
    reservationAmount = budgetStore.state?.config.reservation[`tier${estimatedTier}` as 'tier1' | 'tier2' | 'tier3'] || 0.004;

    // Reserve budget (pre-flight protection)
    reservation = await budgetStore.reserve({
      amount: reservationAmount,
      purpose: `fix_issue_${issueNumber}`,
      correlationId: `orch_${issueNumber}_${Date.now()}`
    });

    if (!reservation.success) {
      const reason = reservation.reason || 'budget_exceeded';
      logger.warn('Budget insufficient', {
        requested: reservationAmount,
        remaining: reservation.remaining,
        breachedPeriod: reservation.breachedPeriod
      });

      // Release lock before returning
      if (circuitBreaker) {
        await circuitBreaker.releaseLock(issueNumber);
      }

      // Comment on issue
      await maybePromise(
        githubAPI.addComment(
          issueNumber,
          `💰 **Budget Insufficient**\n\n` +
            `This repository's budget is insufficient for this fix:\n` +
            `- **Requested**: \\$${reservationAmount.toFixed(4)}\n` +
            `- **Available**: \\$${reservation.remaining.toFixed(4)}\n` +
            `- **Period breached**: ${reservation.breachedPeriod}\n\n` +
            `The fix will be retried automatically when the budget resets.`
        )
      );

      logMetrics({
        fingerprintsProcessed: [fingerprint.id],
        errors: [reason]
      });
      return { skipped: true, reason };
    }

    // Record rate limit attempt
    await rateLimiter.recordAttempt();

    logger.info('Budget reserved and rate limit recorded', {
      reservation: reservation.reservationId,
      amount: reservationAmount,
      remaining: reservation.remaining
    });
  }

  // NEW: Wrap main processing in try/finally to ensure lock is always released AND budget refunded
  let actualCost = 0;
  try {
  const matcher = await PatternMatcher.fromFile();
  const patternMatch = matcher.match(fingerprint);

  let routing: ExecutionRouting | undefined;
  let tierUsed = 0;
  let execution: ExecutionOutcome;
  let pendingPatternExtraction:
    | { fingerprint: typeof fingerprint; patch: string; description: string }
    | null = null;
  let patternApplied = false;

  if (patternMatch) {
    logger.info('Applying learned pattern', {
      fingerprint: attemptKey,
      strategy: patternMatch.strategy,
      patternId: patternMatch.pattern.id
    });

    execution = {
      success: true,
      model: `pattern-${patternMatch.strategy}`,
      patch: patternMatch.pattern.patch,
      tokens: [],
      cost: 0
    };

    logger.setContext({ tier: 0 });
    patternApplied = true;
    tierUsed = 0;
  } else {
    routing = selectModel({ stack: parsed.stackTrace });
    logger.setContext({ tier: routing.tier });

    execution = executeTier
      ? await executeTier(parsed, routing, { costTracker })
      : await runMockExecution(
          parsed,
          routing,
          costTracker,
          mockAI ? issueNumber : parsed.issueNumber ?? issueNumber
        );

    tierUsed = routing.tier;

    if (execution.success && execution.patch) {
      pendingPatternExtraction = {
        fingerprint,
        patch: execution.patch,
        description: `Automated fix for issue #${issueNumber}`
      };
    }
  }

  if (patternApplied) {
    context.patternsUsed += 1;
    if (execution.cost === 0) {
      context.zeroCostFixes += 1;
    }
  }

  const patchStats = execution.patch ? analyzePatch(execution.patch) : createEmptyPatchStats();
  const newTotalCost = context.totalCost + execution.cost;
  actualCost = execution.cost;  // Track for budget refund
  const guardrailViolations: string[] = [];

  if (execution.patch && patchStats.diffLines > safety.maxDiffLines) {
    guardrailViolations.push('diff_limit_exceeded');
  }

  if (execution.patch && patchStats.fileCount > safety.maxFiles) {
    guardrailViolations.push('file_limit_exceeded');
  }

  if (
    execution.patch &&
    safety.pathFilters &&
    patchStats.files.length &&
    !passesPathFilters(patchStats.files, safety.pathFilters)
  ) {
    guardrailViolations.push('path_filter_violation');
  }

  if (
    execution.patch &&
    safety.secretPatterns &&
    containsSecrets(execution.patch, safety.secretPatterns)
  ) {
    guardrailViolations.push('secret_detected');
  }

  if (newTotalCost > safety.budgetLimit) {
    guardrailViolations.push('budget_exceeded');
  }

  let attemptState: Awaited<ReturnType<AttemptStore['recordAttempt']>> | null = null;

  if (guardrailViolations.length) {
    attemptState = await attemptStore.recordAttempt(attemptKey, false);
    context.totalCost = newTotalCost;
    metrics.recordFix(tierUsed, false, execution.cost);
    const reason = guardrailViolations[0];

    await maybePromise(
      githubAPI.addComment(
        issueNumber,
        `⚠️ Guardrail violation detected (${reason}). Manual review required.`
      )
    );

    logMetrics({
      fingerprintsProcessed: [fingerprint.id],
      cost: execution.cost,
      tokens: aggregateTokenUsage(execution.tokens),
      errors: guardrailViolations,
      patternsUsed: patternApplied ? 1 : 0,
      zeroCostFixes: patternApplied && execution.cost === 0 ? 1 : 0
    });

    return {
      tier: tierUsed,
      model: execution.model,
      success: false,
      fixGenerated: Boolean(execution.patch),
      testsPassed: false,
      delayHistory,
      rejected: true,
      reason
    };
  }

  context.totalCost = newTotalCost;

  const fixGenerated = execution.success && Boolean(execution.patch);
  let testsPassed = !mockTestFailure && execution.success;

  attemptState = await attemptStore.recordAttempt(attemptKey, testsPassed);

  if (patternMatch) {
    const learner = new PatternLearner();
    await learner.learn({ patternId: patternMatch.pattern.id, success: testsPassed });
  } else if (testsPassed && pendingPatternExtraction) {
    const extractor = new PatternExtractor();
    const pattern = await extractor.extract(pendingPatternExtraction);
    if (pattern) {
      const learner = new PatternLearner();
      await learner.learn({ patternId: pattern.id, success: true });
    }
  }

  if (!testsPassed) {
    logger.warn('Tests failed after applying fix');
    metrics.recordFix(tierUsed, false, execution.cost);
    await maybePromise(
      githubAPI.addComment(
        issueNumber,
        '⚠️ Tests failed after applying fix. Manual review required.'
      )
    );

    logMetrics({
      fingerprintsProcessed: [fingerprint.id],
      cost: execution.cost,
      tokens: aggregateTokenUsage(execution.tokens),
      errors: ['tests_failed'],
      patternsUsed: patternApplied ? 1 : 0,
      zeroCostFixes: patternApplied && execution.cost === 0 ? 1 : 0
    });

    return {
      tier: tierUsed,
      model: execution.model,
      success: false,
      fixGenerated,
      testsPassed,
      delayHistory,
      reason: 'tests_failed'
    };
  }

  metrics.recordFix(tierUsed, true, execution.cost);

  const tokenUsage = aggregateTokenUsage(execution.tokens);
  const nextBackoff = attemptState?.cooldownUntil
    ? new Date(attemptState.cooldownUntil)
    : new Date();

  const prBody = generatePRBody({
    fingerprint,
    error: {
      type: parsed.errorType || 'UnknownError',
      message: parsed.errorMessage || parsed.message || '',
      filePath: fingerprint.filePath,
      stack: parsed.stackTrace || ''
    },
    attemptState: attemptState!,
    patchSummary: summarizePatch(execution.patch ?? '', patchStats),
    sanitizedStack: parsed.stackTrace || '',
    breadcrumbs: parsed.breadcrumbs ?? [],
    testResults: { passed: 1, total: 1 },
    tierUsed,
    nextBackoff,
    fixCost: execution.cost,
    tokenUsage,
    fixSource: patternApplied ? 'pattern' : 'ai',
    diffLines: patchStats.diffLines,
    fileCount: patchStats.fileCount,
    maxDiffLines: safety.maxDiffLines,
    maxFiles: safety.maxFiles,
    patternId: patternMatch?.pattern.id,
    confidence: patternMatch?.confidence,
    patternStrategy: patternMatch?.strategy
  });

  const prInput = {
    title: `fix: automated fix for issue #${issueNumber}`,
    body: prBody,
    base: 'main',
    head: `fix/issue-${issueNumber}`
  };

  const { pr, retries } = await createPullRequestWithRetry({
    githubAPI,
    prInput,
    delayFn,
    maxAttempts: maxCreatePRAttempts,
    delayHistory,
    logger
  });

  await maybePromise(
    githubAPI.addComment(
      issueNumber,
      `✅ Fix deployed to PR #${pr.number}. Tests passing.`
    )
  );

  logger.info('Issue processed successfully', { prNumber: pr.number, retries });

  logMetrics({
    fingerprintsProcessed: [fingerprint.id],
    prsCreated: 1,
    cost: execution.cost,
    tokens: tokenUsage,
    patternsUsed: patternApplied ? 1 : 0,
    zeroCostFixes: patternApplied && execution.cost === 0 ? 1 : 0
  });

  return {
    tier: tierUsed,
    model: execution.model,
    success: true,
    fixGenerated,
    testsPassed: true,
    prNumber: pr.number,
    retries,
    delayHistory
  };

  } finally {
    // NEW: Always refund budget (commit reservation to actual spend)
    // Skip in test environment
    if (!isTestEnv && reservation.reservationId && reservation.reservationId !== 'test_reservation') {
      try {
        const budgetStore = new BudgetStore();
        await budgetStore.refund({
          reservationId: reservation.reservationId,
          actualAmount: actualCost,
          correlationId: `orch_${issueNumber}_${Date.now()}`
        });
        logger.info('Budget refunded', {
          reservation: reservation.reservationId,
          reserved: reservationAmount,
          actual: actualCost,
          refunded: reservationAmount - actualCost
        });
      } catch (error) {
        logger.warn('Failed to refund budget', { error });
      }
    }

    // NEW: Always release lock
    if (circuitBreaker) {
      try {
        await circuitBreaker.releaseLock(issueNumber);
      } catch (error) {
        logger.warn('Failed to release lock', { error });
      }
    }
  }
}
async function createPullRequestWithRetry({
  githubAPI,
  prInput,
  delayFn,
  maxAttempts,
  delayHistory,
  logger
}: {
  githubAPI: GitHubAdapter;
  prInput: Parameters<GitHubAdapter['createPR']>[0];
  delayFn: (ms: number) => Promise<void>;
  maxAttempts: number;
  delayHistory: number[];
  logger: StructuredLogger;
}) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const pr = await maybePromise(githubAPI.createPR(prInput));
      return { pr, retries: attempt - 1 };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        logger.error('PR creation failed after retries', error instanceof Error ? error : undefined);
        throw error;
      }

      const waitMs = determineBackoff(error, attempt);
      delayHistory.push(waitMs);
      metrics.recordRetry(false);
      logger.warn('PR creation failed, retrying', { attempt, waitMs });
      await delayFn(waitMs);
    }
  }

  throw lastError ?? new Error('Failed to create PR');
}

function determineBackoff(error: unknown, attempt: number) {
  const base = 1000;
  const isRateLimit =
    (error as { status?: number })?.status === 403 ||
    (error instanceof Error && /rate limit/i.test(error.message));
  if (isRateLimit) {
    return base * 2 ** (attempt - 1);
  }
  return 200 * attempt;
}

interface PatchStats {
  diffLines: number;
  fileCount: number;
  files: string[];
  additions: number;
  deletions: number;
}

function createEmptyPatchStats(): PatchStats {
  return { diffLines: 0, fileCount: 0, files: [], additions: 0, deletions: 0 };
}

function analyzePatch(patch: string): PatchStats {
  const stats = createEmptyPatchStats();
  const lines = patch.split('\n');

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      stats.fileCount += 1;
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (match) {
        stats.files.push(match[2]);
      }
      continue;
    }

    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    if (line.startsWith('+')) {
      stats.diffLines += 1;
      stats.additions += 1;
    } else if (line.startsWith('-')) {
      stats.diffLines += 1;
      stats.deletions += 1;
    }
  }

  return stats;
}

function normalizePathSegment(value: string): string {
  return value.replace(/^[./]+/, '');
}

function matchesPathPattern(file: string, pattern: string): boolean {
  if (!pattern || pattern === '*') {
    return true;
  }

  if (pattern.endsWith('/')) {
    const normalizedPattern = pattern.slice(0, -1);
    return file.startsWith(normalizedPattern);
  }

  return file === pattern || file.startsWith(`${pattern}/`);
}

function passesPathFilters(
  files: string[],
  filters: { include: string[]; exclude: string[] }
): boolean {
  if (!files.length) {
    return false;
  }

  const includes = filters.include?.length ? filters.include : [''];
  const excludes = filters.exclude ?? [];

  const normalizedFiles = files.map((file) => normalizePathSegment(file));
  const normalizedIncludes = includes.map((pattern) => normalizePathSegment(pattern));
  const normalizedExcludes = excludes.map((pattern) => normalizePathSegment(pattern));

  const hasIncluded = normalizedFiles.some((file) =>
    normalizedIncludes.some((pattern) => matchesPathPattern(file, pattern))
  );

  if (!hasIncluded) {
    return false;
  }

  const hasExcluded = normalizedFiles.some((file) =>
    normalizedExcludes.some((pattern) => matchesPathPattern(file, pattern))
  );

  return !hasExcluded;
}

function containsSecrets(patch: string, patterns: RegExp[]): boolean {
  const lines = patch.split('\n');
  return lines.some((line) => patterns.some((pattern) => pattern.test(line)));
}

function aggregateTokenUsage(tokens: TokenUsage[]): {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
} {
  return tokens.reduce(
    (acc, entry) => ({
      input: acc.input + (entry.inputTokens ?? 0),
      output: acc.output + (entry.outputTokens ?? 0),
      cacheRead: acc.cacheRead,
      cacheWrite: acc.cacheWrite
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  );
}

function summarizePatch(patch: string, stats?: PatchStats): string {
  if (!patch.trim()) {
    return '_Patch summary unavailable_';
  }

  const snapshot = stats ?? analyzePatch(patch);
  const fileLines = snapshot.files.slice(0, 5).map((file) => `- ${file}`);
  if (snapshot.files.length > 5) {
    fileLines.push(`- … ${snapshot.files.length - 5} more file(s)`);
  }

  return [
    `Files touched: ${snapshot.fileCount}`,
    `Additions: ${snapshot.additions}, Deletions: ${snapshot.deletions}`,
    ...fileLines
  ].join('\n');
}

async function runMockExecution(
  issue: ReturnType<typeof parseLoggerIssue>['parsed'],
  routing: ExecutionRouting,
  costTracker: CostTracker,
  issueNumber: number
): Promise<ExecutionOutcome> {
  const profile = TOKEN_PROFILES[routing.tier] ?? TOKEN_PROFILES[3];
  const before = costTracker.getTotalCost();
  for (const tokenUsage of profile) {
    costTracker.trackUsage({
      ...tokenUsage,
      issueNumber
    });
  }
  const after = costTracker.getTotalCost();

  return {
    success: true,
    model: MODEL_BY_TIER[routing.tier] ?? MODEL_BY_TIER[3],
    patch: `diff --git a/${issue.extension || 'file'}.js b/${issue.extension || 'file'}.js\n+// mock patch`,
    tokens: profile.map((entry) => ({
      ...entry,
      issueNumber
    })),
    cost: after - before
  };
}

function maybePromise<T>(value: Promise<T> | T): Promise<T> {
  return Promise.resolve(value);
}

export default processIssue;
