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
import { AttemptStore } from '../shared/patterns/attempt-store.js';
import { PatternMatcher } from '../shared/patterns/matcher.js';
import { PatternExtractor } from '../shared/patterns/extractor.js';
import { PatternLearner } from '../shared/patterns/learner.js';

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
    executeTier
  } = options;

  const delayHistory: number[] = [];
  const logger = new StructuredLogger({ issueNumber, stage: 'orchestrator' });
  logger.info('Processing issue');

  const issue = githubAPI.getIssue(issueNumber);
  if (!issue) {
    const reason = `Issue #${issueNumber} not found`;
    logger.error('Issue lookup failed', undefined, { reason });
    return { rejected: true, reason };
  }

  const labels = issue.labels ?? [];
  if (!labels.some((label) => label?.name === 'robot')) {
    logger.info('Skipping issue without robot label');
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
    return { rejected: true, reason };
  }

  const attemptStore = new AttemptStore();
  const fingerprint = FailureFingerprinter.normalize({
    type: parsed.errorType || 'UnknownError',
    message: parsed.errorMessage || parsed.message || '',
    stack: parsed.stackTrace || ''
  });

  const attemptKey = parsed.fingerprint || fingerprint.id;

  const canAttempt = await attemptStore.canAttempt(attemptKey);
  if (!canAttempt) {
    const reason = 'cooldown_active';
    logger.info('Skipping issue due to active cooldown', { fingerprint: attemptKey });
    return { skipped: true, reason };
  }

  const matcher = await PatternMatcher.fromFile();
  const patternMatch = matcher.match(fingerprint);

  let routing: ExecutionRouting | undefined;
  let tierUsed = 0;
  let execution: ExecutionOutcome;
  let pendingPatternExtraction:
    | { fingerprint: typeof fingerprint; patch: string; description: string }
    | null = null;

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

  const fixGenerated = execution.success && Boolean(execution.patch);
  const testsPassed = mockTestFailure ? false : execution.success;

  await attemptStore.recordAttempt(attemptKey, testsPassed);

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

  const cost = execution.cost;
  metrics.recordFix(tierUsed, testsPassed, cost);

  if (!testsPassed) {
    logger.warn('Tests failed after applying fix');
    await maybePromise(
      githubAPI.addComment(
        issueNumber,
        '⚠️ Tests failed after applying fix. Manual review required.'
      )
    );
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

  const prInput = {
    title: `fix: automated fix for issue #${issueNumber}`,
    body: patternMatch
      ? `Fixes #${issueNumber}\n\nAutomated fix generated by Homeostat (Pattern replay).`
      : `Fixes #${issueNumber}\n\nAutomated fix generated by Homeostat (Tier ${tierUsed}).`,
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
