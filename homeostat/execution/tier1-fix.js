/**
 * Tier 1 execution per DEEPSEEK-MULTI-AI-ARCHITECTURE.md lines 783-915.
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
      { role: 'system', content: 'You fix Chrome extension bugs with safe patches.' },
      { role: 'user', content: prompt }
    ],
    fetchImpl
  });
  return extractMessageContent(response);
}

async function callOpenAI(issue, { fetchImpl = fetch } = {}) {
  const prompt = buildContextAwarePrompt(issue);
  const response = await callModel({
    endpoint: OPENAI_ENDPOINT,
    model: 'gpt-5',
    apiKey: process.env.OPENAI_API_KEY,
    messages: [
      { role: 'system', content: 'You are a senior Chrome extension engineer reviewing DeepSeek output.' },
      { role: 'user', content: prompt }
    ],
    fetchImpl
  });
  return extractMessageContent(response);
}

export async function executeTier1(issueNumber, options = {}) {
  const {
    fetchImpl = fetch,
    runTestsFn = runTests,
    callDeepSeekFn = callDeepSeek,
    callOpenAIFn = callOpenAI,
    history = []
  } = options;

  const issue = await parseIssue(issueNumber, { fetchImpl });
  const sanitizedIssue = await sanitizeIssuePayload(issue);

  if (detectFixLoop(sanitizedIssue.stackTrace, history)) {
    throw new Error('Potential fix loop detected. Escalating to human review.');
  }

  let usedFallback = false;

  const executor = async () => {
    try {
      const patch = await callDeepSeekFn(sanitizedIssue, { fetchImpl });
      validatePatch(patch);
      const tests = await runTestsFn();
      return { testsPassed: tests.passed, testOutput: tests.output, patch, model: 'deepseek-v3.2-exp' };
    } catch (error) {
      if (error.message?.includes('Security violation')) {
        throw error;
      }
      if (usedFallback) {
        throw error;
      }
      usedFallback = true;
      const patch = await callOpenAIFn(sanitizedIssue, { fetchImpl });
      validatePatch(patch);
      const tests = await runTestsFn();
      return { testsPassed: tests.passed, testOutput: tests.output, patch, model: 'gpt-5' };
    }
  };

  const result = await attemptFixWithRetries({ tier: 1, executeAttempt: executor }, { stack: sanitizedIssue.stackTrace }, 2);
  return { ...result, issue: sanitizedIssue };
}

async function runCLI() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--issue-number');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node tier1-fix.js --issue-number <number>');
    process.exit(1);
  }
  const issueNumber = Number(args[idx + 1]);
  try {
    const outcome = await executeTier1(issueNumber);
    console.log(JSON.stringify({ success: outcome.success ?? false, attempts: outcome.attempts?.length ?? 0 }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runCLI();
}

export default executeTier1;
