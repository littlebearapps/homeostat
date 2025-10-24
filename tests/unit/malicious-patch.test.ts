import { describe, expect, it } from 'vitest';
import {
  buildContextAwarePrompt,
  detectFixLoop,
  mergeAttemptOutputs,
  sanitizeIssuePayload,
  validatePatch
} from '../../homeostat/execution/ai-utils.js';

const ISSUE = {
  extension: 'NoteBridge',
  surface: 'background',
  stackTrace: 'Error\n    at background/index.js:10:2',
  breadcrumbs: ['1. Did x', '2. Did y']
};

describe('malicious patch blocker', () => {
  it('allows harmless patches', () => {
    expect(() => validatePatch('const value = 1;')).not.toThrow();
  });

  it('blocks eval usage', () => {
    expect(() => validatePatch('eval(userInput);')).toThrow(/Security violation/);
  });

  it('blocks new Function usage', () => {
    expect(() => validatePatch('const fn = new Function("return 1");')).toThrow();
  });

  it('blocks document.write', () => {
    expect(() => validatePatch('document.write("hello");')).toThrow();
  });

  it('blocks chrome debugger access', () => {
    expect(() => validatePatch('chrome.debugger.attach();')).toThrow();
  });

  it('blocks fetch to unknown domains', () => {
    expect(() => validatePatch("fetch('https://unknown.example.com/data');")).toThrow();
  });

  it('detects fix loops based on stack similarity', () => {
    const history = ['Error\n    at background/index.js:10:2\n    at shared/util.js:5:1'];
    expect(detectFixLoop('Error\n    at background/index.js:10:2\n    at shared/util.js:5:1', history)).toBe(true);
  });

  it('allows distinct stacks to continue', () => {
    const history = ['Error\n    at background/index.js:10:2'];
    expect(detectFixLoop('Error\n    at popup/index.js:5:1', history)).toBe(false);
  });

  it('builds context aware prompts for background surface', () => {
    const prompt = buildContextAwarePrompt(ISSUE);
    expect(prompt).toContain('Service worker context');
    expect(prompt).toContain('Error Stack:');
  });

  it('sanitizes issue payloads before usage', async () => {
    const sanitized = await sanitizeIssuePayload({ ...ISSUE, stackTrace: 'Error at 10.0.0.1' });
    expect(sanitized.stackTrace).toContain('[REDACTED_IP]');
  });

  it('identifies merged outputs with high similarity', () => {
    const previous = { testOutput: 'Error: Timeout after 30s' };
    const current = { testOutput: 'Error: Timeout after 30s' };
    expect(mergeAttemptOutputs(previous, current)).toBe(true);
  });

  it('recognizes distinct attempt outputs', () => {
    const previous = { testOutput: 'Error: Timeout after 30s' };
    const current = { testOutput: 'Tests passed successfully' };
    expect(mergeAttemptOutputs(previous, current)).toBe(false);
  });
});
