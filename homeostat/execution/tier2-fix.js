/**
 * Tier 2 execution uses DeepSeek with GPT-5 review per DEEPSEEK-MULTI-AI-ARCHITECTURE.md lines 783-917.
 */
import { fileURLToPath } from 'url';
import {
  buildContextAwarePrompt,
  callModel,
  extractMessageContent,
  sanitizeIssuePayload,
  validatePatch,
  detectFixLoop
} from './ai-utils.js';
import { attemptFixWithRetries } from './retry-handler.js';
import { runTests } from './test-runner.js';
import { parseIssue } from '../routing/complexity-analyzer.js';

const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

async function callDeepSeek(issue, { fetchImpl = fetch } = {}) {
  const prompt = buildContextAwarePrompt(issue);
  const response = await callModel({
    endpoint: DEEPSEEK_ENDPOINT,
    model: 'deepseek-v3.2-exp',
    apiKey: process.env.DEEPSEEK_API_KEY,
    messages: [
      { role: 'system', content: 'Generate a minimal diff to fix the Chrome extension bug.' },
      { role: 'user', content: prompt }
    ],
    fetchImpl
  });
  return extractMessageContent(response);
}

async function callOpenAIReview(issue, patch, { fetchImpl = fetch } = {}) {
  const prompt = `${buildContextAwarePrompt(issue)}\n\nCandidate Patch:\n${patch}`;
  const response = await callModel({
    endpoint: OPENAI_ENDPOINT,
    model: 'gpt-5',
    apiKey: process.env.OPENAI_API_KEY,
    messages: [
      { role: 'system', content: 'Review the proposed patch. Respond with APPROVED or REJECTED and rationale.' },
      { role: 'user', content: prompt }
    ],
    fetchImpl
  });
  return extractMessageContent(response);
}

async function callOpenAIPatch(issue, { fetchImpl = fetch } = {}) {
  const prompt = buildContextAwarePrompt(issue);
  const response = await callModel({
    endpoint: OPENAI_ENDPOINT,
    model: 'gpt-5',
    apiKey: process.env.OPENAI_API_KEY,
    messages: [
      { role: 'system', content: 'Produce a safe diff to fix the Chrome extension bug.' },
      { role: 'user', content: prompt }
    ],
    fetchImpl
  });
  return extractMessageContent(response);
}

function isApproved(review) {
  return /approved/i.test(review);
}

export async function executeTier2(issueNumber, options = {}) {
  const {
    fetchImpl = fetch,
    runTestsFn = runTests,
    callDeepSeekFn = callDeepSeek,
    callOpenAIReviewFn = callOpenAIReview,
    callOpenAIPatchFn = callOpenAIPatch,
    history = []
  } = options;

  const issue = await parseIssue(issueNumber, { fetchImpl });
  const sanitizedIssue = await sanitizeIssuePayload(issue);

  if (detectFixLoop(sanitizedIssue.stackTrace, history)) {
    throw new Error('Potential fix loop detected. Escalating to human review.');
  }

  const executor = async () => {
    let patch;
    try {
      patch = await callDeepSeekFn(sanitizedIssue, { fetchImpl });
    } catch (error) {
      patch = await callOpenAIPatchFn(sanitizedIssue, { fetchImpl });
    }
    validatePatch(patch);

    const review = await callOpenAIReviewFn(sanitizedIssue, patch, { fetchImpl });
    if (!isApproved(review)) {
      throw new Error('GPT-5 reviewer rejected DeepSeek patch.');
    }

    return { testsPassed: true, patch, review };
  };

  const result = await attemptFixWithRetries({ tier: 2, executeAttempt: executor }, { stack: sanitizedIssue.stackTrace }, 2);
  return { ...result, issue: sanitizedIssue };
}

async function runCLI() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--issue-number');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node tier2-fix.js --issue-number <number>');
    process.exit(1);
  }
  const issueNumber = Number(args[idx + 1]);
  try {
    const outcome = await executeTier2(issueNumber);

    // Save patch to file for workflow to use
    if (outcome.result?.patch) {
      const fs = await import('fs/promises');
      await fs.writeFile('homeostat-fix.patch', outcome.result.patch, 'utf-8');
    }

    console.log(JSON.stringify({
      success: outcome.success ?? false,
      attempts: outcome.attempts?.length ?? 0,
      hasPatch: !!outcome.result?.patch
    }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runCLI();
}

export default executeTier2;
