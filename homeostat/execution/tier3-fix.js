/**
 * Tier 3 execution uses GPT-5 only per DEEPSEEK-MULTI-AI-ARCHITECTURE.md lines 783-1000.
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

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

async function callOpenAI(issue, { fetchImpl = fetch } = {}) {
  const prompt = buildContextAwarePrompt(issue);
  const response = await callModel({
    endpoint: OPENAI_ENDPOINT,
    model: 'gpt-5',
    apiKey: process.env.OPENAI_API_KEY,
    messages: [
      { role: 'system', content: 'Provide a safe diff to resolve the Chrome extension error.' },
      { role: 'user', content: prompt }
    ],
    fetchImpl
  });
  return extractMessageContent(response);
}

export async function executeTier3(issueNumber, options = {}) {
  const { fetchImpl = fetch, runTestsFn = runTests, callOpenAIFn = callOpenAI, history = [] } = options;
  const issue = await parseIssue(issueNumber, { fetchImpl });
  const sanitizedIssue = await sanitizeIssuePayload(issue);

  if (detectFixLoop(sanitizedIssue.stackTrace, history)) {
    throw new Error('Potential fix loop detected. Escalating to human review.');
  }

  const executor = async () => {
    const patch = await callOpenAIFn(sanitizedIssue, { fetchImpl });
    validatePatch(patch);
    const tests = await runTestsFn();
    return { testsPassed: tests.passed, testOutput: tests.output, patch, model: 'gpt-5' };
  };

  const result = await attemptFixWithRetries({ tier: 3, executeAttempt: executor }, { stack: sanitizedIssue.stackTrace }, 1);
  return { ...result, issue: sanitizedIssue };
}

async function runCLI() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--issue-number');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node tier3-fix.js --issue-number <number>');
    process.exit(1);
  }
  const issueNumber = Number(args[idx + 1]);
  try {
    const outcome = await executeTier3(issueNumber);
    console.log(JSON.stringify({ success: outcome.success ?? false, attempts: outcome.attempts?.length ?? 0 }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runCLI();
}

export default executeTier3;
