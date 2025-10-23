import { readFileSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sanitizeForAPI, sanitizeStackTrace } from '../../shared/privacy/sanitizer.js';
import { parseLoggerIssue } from '../../homeostat/routing/issue-parser.js';
import { buildContextAwarePrompt, sanitizeIssuePayload } from '../../homeostat/execution/ai-utils.js';
import { createIssue } from '../mocks/issue-generator';

// Verifies the synthetic corpus from security/pii-corpus.txt is fully redacted before
// any data reaches downstream AI models or logging sinks.

interface Detector {
  name: string;
  regex: RegExp;
  placeholders: string[];
}

const corpusPath = path.join(process.cwd(), 'security/pii-corpus.txt');
const corpusLines = readFileSync(corpusPath, 'utf-8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

const DETECTORS: Detector[] = [
  { name: 'EMAIL', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, placeholders: ['[REDACTED_EMAIL]', '[REDACTED_URL]@'] },
  { name: 'API_KEY', regex: /sk-[a-zA-Z0-9]{32,}/, placeholders: ['[REDACTED_API_KEY]', '[REDACTED_TOKEN]'] },
  { name: 'STRIPE_KEY', regex: /sk_(?:live|test)_[a-zA-Z0-9]{16,}/, placeholders: ['[REDACTED_API_KEY]', '[REDACTED_TOKEN]'] },
  { name: 'GITHUB_TOKEN', regex: /gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}/, placeholders: ['[REDACTED_GITHUB_TOKEN]', '[REDACTED_TOKEN]'] },
  { name: 'LINEAR_KEY', regex: /lin_api_[a-zA-Z0-9]{40}/, placeholders: ['[REDACTED_LINEAR_KEY]'] },
  { name: 'PLAUSIBLE_KEY', regex: /plausible_[A-Za-z0-9_-]{32,}/, placeholders: ['[REDACTED_PLAUSIBLE_KEY]', '[REDACTED_TOKEN]'] },
  { name: 'GOOGLE_KEY', regex: /AIza[a-zA-Z0-9_-]{35}/, placeholders: ['[REDACTED_API_KEY]', '[REDACTED_TOKEN]'] },
  { name: 'AWS_KEY', regex: /AKIA[0-9A-Z]{16}/, placeholders: ['[REDACTED_API_KEY]', '[REDACTED_TOKEN]'] },
  { name: 'JWT', regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, placeholders: ['[REDACTED_JWT]'] },
  { name: 'OAUTH', regex: /xoxb-[A-Za-z0-9-]{30,}/, placeholders: ['[REDACTED_TOKEN]'] },
  {
    name: 'IP',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b|(?:[A-F0-9]{1,4}:){2,}[A-F0-9]{1,4}/i,
    placeholders: ['[REDACTED_IP]']
  },
  {
    name: 'USER_PATH',
    regex: /\/Users\/[^\s]+\/|\/home\/[^\s]+\/|C:\\Users\\[^\s]+\\/,
    placeholders: ['[REDACTED_USER_PATH]', '[REDACTED_WINDOWS_USER_PATH]']
  },
  {
    name: 'PRIVATE_KEY',
    regex: /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/,
    placeholders: ['[REDACTED_API_KEY]', '[REDACTED_TOKEN]']
  },
  { name: 'URL_CREDENTIALS', regex: /(https?:\/\/)[^\s@]+:[^\s@]+@/, placeholders: ['[REDACTED_URL]@'] },
  {
    name: 'QUERY_PARAM',
    regex: /[?&](?:api[_-]?key|token|session|auth|access[_-]?token)=[^&\s]+/i,
    placeholders: ['[REDACTED_QUERY_VALUE]']
  }
];

function matchingDetectors(value: string) {
  return DETECTORS.filter((detector) => detector.regex.test(value));
}

function stripPlaceholders(value: string, placeholders: string[]) {
  return placeholders.reduce((current, placeholder) => current.split(placeholder).join(''), value);
}

describe('security: PII leak validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts entire corpus in sanitized stack traces', async () => {
    let assertionCount = 0;
    for (const entry of corpusLines) {
      const sanitized = await sanitizeForAPI('', `Error\n    at ${entry}`);
      const detectors = matchingDetectors(entry);
      for (const detector of detectors) {
        const cleanedStack = stripPlaceholders(sanitized.stackTrace, detector.placeholders);
        expect(detector.regex.test(cleanedStack)).toBe(false);
        assertionCount += 1;
        const placeholderPresent = detector.placeholders.some((placeholder) =>
          sanitized.stackTrace.includes(placeholder)
        );
        expect(placeholderPresent).toBe(true);
        assertionCount += 1;
        expect(sanitized.stackTrace.includes(entry)).toBe(false);
        assertionCount += 1;
        const cleanedCode = stripPlaceholders(sanitized.code, detector.placeholders);
        expect(detector.regex.test(cleanedCode)).toBe(false);
        assertionCount += 1;
        expect(sanitized.code.includes(entry)).toBe(false);
        assertionCount += 1;
      }
    }
    expect(assertionCount).toBeGreaterThanOrEqual(100);
  });

  it('preserves sanitization through issue parsing and prompt construction', async () => {
    let assertionCount = 0;
    for (const entry of corpusLines) {
      const detectors = matchingDetectors(entry);
      if (!detectors.length) continue;

      const issue = createIssue({
        message: 'PII leak candidate',
        stackFrames: [`Error: ${entry}`, '    at background/index.js:12:4'],
        fingerprint: 'pii-fingerprint',
        breadcrumbs: ['1. Step']
      });

      const { parsed } = parseLoggerIssue(issue);
      const sanitized = await sanitizeIssuePayload({ ...parsed, surface: 'background' });
      const prompt = buildContextAwarePrompt({ ...sanitized, surface: 'background' });

      detectors.forEach((detector) => {
        const cleanedStack = stripPlaceholders(sanitized.stackTrace, detector.placeholders);
        expect(detector.regex.test(cleanedStack)).toBe(false);
        assertionCount += 1;
        const cleanedPrompt = stripPlaceholders(prompt, detector.placeholders);
        expect(detector.regex.test(cleanedPrompt)).toBe(false);
        assertionCount += 1;
        expect(sanitized.stackTrace.includes(entry)).toBe(false);
        assertionCount += 1;
        expect(cleanedPrompt.includes(entry)).toBe(false);
        assertionCount += 1;
      });
    }
    expect(assertionCount).toBeGreaterThanOrEqual(100);
  });

  it('ensures sanitized logs never contain raw PII', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    corpusLines.forEach((entry) => {
      const sanitized = sanitizeStackTrace(`Error\n    at ${entry}`);
      console.log(sanitized);
      console.error(sanitized);
    });

    const combined = [...logSpy.mock.calls.flat(), ...errorSpy.mock.calls.flat()].join(' ');
    DETECTORS.forEach((detector) => {
      const cleaned = stripPlaceholders(combined, detector.placeholders);
      expect(detector.regex.test(cleaned)).toBe(false);
    });
  });
});
