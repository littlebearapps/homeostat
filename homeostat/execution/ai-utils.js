/**
 * Shared AI execution utilities informed by DEEPSEEK-MULTI-AI-ARCHITECTURE.md
 * lines 783-1150.
 */
import { sanitizeForAPI } from '../../shared/privacy/sanitizer.js';
import { isSensitiveFile } from '../config/sensitive-files.js';
import { levenshteinDistance } from './retry-handler.js';

export const DEFAULT_TIMEOUT = 30000;

export function buildContextAwarePrompt(issue) {
  const surface = issue.surface || 'background';
  let contextGuidance = '';
  if (surface === 'background') {
    contextGuidance = `CRITICAL CHROME CONTEXT:\n- Service worker context (no DOM)\n- Use chrome.* APIs with async callbacks\n- Manifest V3 restrictions apply`;
  } else if (surface === 'content') {
    contextGuidance = `CRITICAL CHROME CONTEXT:\n- Content script injected into web pages\n- Limited chrome.* access (runtime, i18n, storage)\n- Communicate with background via messaging`;
  } else {
    contextGuidance = `CRITICAL CHROME CONTEXT:\n- Popup window with DOM and chrome.* access\n- Popup lifetime is short; persist state elsewhere`;
  }

  return [
    'You are a Chrome extension bug-fixing assistant.',
    `Extension: ${issue.extension}`,
    `Surface: ${surface}`,
    '',
    contextGuidance,
    '',
    'Error Stack:',
    issue.stackTrace,
    '',
    'Breadcrumbs:',
    issue.breadcrumbs?.join('\n') ?? ''
  ].join('\n');
}

export async function callModel({
  endpoint,
  model,
  apiKey,
  messages,
  fetchImpl = fetch,
  timeout = DEFAULT_TIMEOUT
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Model API error: ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function extractMessageContent(response) {
  const choice = response?.choices?.[0];
  const content = choice?.message?.content || '';
  return content.trim();
}

export function validatePatch(patch) {
  const files = extractPatchedFiles(patch);
  for (const file of files) {
    if (isSensitiveFile(file)) {
      throw new Error(`Security violation detected: sensitive file ${file}`);
    }
  }
  const suspiciousPatterns = [
    /eval\(/,
    /new Function\(/,
    /document\.write\(/,
    /\bexec\(/,
    /chrome\.debugger/,
    /fetch\(['"]https?:\/\/(?!api\.littlebearapps\.com)/
  ];
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(patch)) {
      throw new Error(`Security violation detected: ${pattern}`);
    }
  }
}

function extractPatchedFiles(patch = '') {
  const files = new Set();
  const diffHeaderRegex = /^diff --git a\/(\S+) b\/(\S+)/gm;
  let match;
  while ((match = diffHeaderRegex.exec(patch))) {
    files.add(match[1]);
    files.add(match[2]);
  }
  const fileHeaderRegex = /^[+-]{3} [ab]\/(\S+)/gm;
  while ((match = fileHeaderRegex.exec(patch))) {
    files.add(match[1]);
  }
  return Array.from(files).filter(Boolean);
}

export function detectFixLoop(currentStack, history = []) {
  if (!history.length) return false;
  const currentLines = new Set(currentStack.split('\n').map((line) => line.trim()).filter(Boolean));
  for (const previous of history) {
    const previousLines = new Set(previous.split('\n').map((line) => line.trim()).filter(Boolean));
    const intersection = new Set([...currentLines].filter((line) => previousLines.has(line)));
    const union = new Set([...currentLines, ...previousLines]);
    if (union.size === 0) continue;
    const similarity = intersection.size / union.size;
    if (similarity > 0.8) {
      return true;
    }
  }
  return false;
}

export async function ensureGitHubQuota(fetchImpl = fetch) {
  const response = await fetchImpl('https://api.github.com/rate_limit', {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
    }
  });
  if (!response.ok) return;
  const data = await response.json();
  const remaining = data?.resources?.core?.remaining ?? 1000;
  const reset = data?.resources?.core?.reset;
  if (remaining < 100 && reset) {
    const waitMs = Math.max(0, reset * 1000 - Date.now());
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

export async function sanitizeIssuePayload(issue) {
  const sanitized = await sanitizeForAPI('', issue.stackTrace ?? '');
  return { ...issue, stackTrace: sanitized.stackTrace };
}

export function buildAttemptResult({ patch, tests }) {
  return {
    patch,
    testsPassed: tests?.passed ?? false,
    testOutput: tests?.output ?? ''
  };
}

export function mergeAttemptOutputs(previous, current) {
  const prevOutput = previous?.testOutput ?? '';
  const currOutput = current?.testOutput ?? '';
  const distance = levenshteinDistance(prevOutput, currOutput);
  const maxLength = Math.max(prevOutput.length, currOutput.length) || 1;
  return distance / maxLength <= 0.1;
}
