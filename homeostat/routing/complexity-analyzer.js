/**
 * Complexity analyzer per LOGGER-INTEGRATION.md lines 55-295 and
 * IMPLEMENTATION-ROADMAP.md lines 299-307.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import selectModel from './model-selector.js';
import { parseLoggerIssue } from './issue-parser.js';

const GITHUB_API_BASE = 'https://api.github.com';

export async function parseIssue(issueNumber, { fetchImpl = fetch } = {}) {
  if (!issueNumber) {
    throw new Error('issueNumber is required');
  }
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    throw new Error('GITHUB_REPOSITORY is required to parse issues');
  }

  const url = `${GITHUB_API_BASE}/repos/${repository}/issues/${issueNumber}`;
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch issue ${issueNumber}: ${response.status} ${text}`);
  }

  const issue = await response.json();
  const { parsed, errors } = parseLoggerIssue(issue);

  if (errors.length) {
    throw new Error(`Invalid issue ${issueNumber}: ${errors.join('; ')}`);
  }

  return parsed;
}

export function analyzeComplexity(error) {
  return selectModel({ stack: error.stackTrace });
}

function writeGitHubOutput(data) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  const lines = Object.entries(data).map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`);
}

async function runCLI() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--issue-number');
  if (index === -1 || !args[index + 1]) {
    console.error('Usage: node complexity-analyzer.js --issue-number <number>');
    process.exit(1);
  }
  const issueNumber = Number(args[index + 1]);
  try {
    const parsedIssue = await parseIssue(issueNumber);
    const routing = analyzeComplexity({ stackTrace: parsedIssue.stackTrace });
    const output = {
      issueNumber,
      extension: parsedIssue.extension,
      tier: routing.tier,
      model: routing.model,
      attempts: routing.attempts
    };
    console.log(JSON.stringify(output, null, 2));
    writeGitHubOutput({ tier: routing.tier, model: routing.model });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runCLI();
}

export default { parseIssue, analyzeComplexity };
