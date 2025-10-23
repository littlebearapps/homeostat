import maliciousIssues from '../../security/malicious-issues.json' assert { type: 'json' };
import { describe, expect, it } from 'vitest';
import { parseLoggerIssue } from '../../homeostat/routing/issue-parser.js';
import { buildContextAwarePrompt, sanitizeIssuePayload, validatePatch } from '../../homeostat/execution/ai-utils.js';
import { sanitizeStackTrace } from '../../shared/privacy/sanitizer.js';

// Exercises 10+ adversarial scenarios spanning prompt injection, code injection,
// sensitive file access, and denial-of-service attempts.
function buildOversizedBody(base: string) {
  const padding = 'A'.repeat(120 * 1024);
  return `${base}\n${padding}`;
}

describe('security: malicious payload resistance', () => {
  it('ignores prompt injection attempts in issue titles and bodies', async () => {
    const issue = maliciousIssues.prompt_injection;
    const { parsed } = parseLoggerIssue(issue);
    const sanitized = await sanitizeIssuePayload({ ...parsed, surface: 'background' });
    const prompt = buildContextAwarePrompt({ ...sanitized, surface: 'background' });
    expect(prompt).not.toMatch(/ignore previous instructions/i);
  });

  it('blocks code injection attempts with eval and child_process', () => {
    expect(() => validatePatch(maliciousIssues.code_injection.suggestedPatch!)).toThrow(/Security violation/);
  });

  it('blocks sensitive file modifications and escalates', () => {
    expect(() => validatePatch(maliciousIssues.sensitive_file_attack.suggestedPatch!)).toThrow(/sensitive file/i);
  });

  it('sanitizes encoded malicious payloads', () => {
    const issue = maliciousIssues.base64_encoded;
    const sanitized = sanitizeStackTrace(issue.body);
    expect(sanitized).not.toMatch(/RXhwb3J0/);
    expect(sanitized).toContain('[REDACTED_TOKEN]');
  });

  it('detects fetch calls to unknown domains', () => {
    expect(() => validatePatch(maliciousIssues.credential_harvest.suggestedPatch!)).toThrow(/Security violation/);
  });

  it('rejects oversized issue bodies to prevent DoS', () => {
    const issue = maliciousIssues.oversized_body;
    const body = buildOversizedBody(issue.body);
    const { errors } = parseLoggerIssue({ ...issue, body });
    expect(errors).toContainEqual(expect.stringMatching(/exceeds 100KB/i));
  });

  it('blocks command injection attempts', () => {
    expect(() => validatePatch(maliciousIssues.command_injection.suggestedPatch!)).toThrow(/exec/);
  });

  it('handles unicode-based attacks safely', () => {
    const issue = maliciousIssues.unicode_trick;
    const sanitized = sanitizeStackTrace(issue.body);
    expect(sanitized).toContain('attack');
    expect(sanitized).not.toContain('\u202e');
  });

  it('parses SQL injection attempts without executing them', () => {
    const issue = maliciousIssues.sql_injection;
    const { parsed } = parseLoggerIssue(issue);
    expect(parsed.stackTrace).toContain('SELECT * FROM users');
  });

  it('blocks manifest permission escalation attempts', () => {
    expect(() => validatePatch(maliciousIssues.sensitive_file_attack.suggestedPatch!)).toThrow(/manifest\.json/);
  });
});
