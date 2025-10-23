import { describe, expect, it } from 'vitest';
import sanitizeForAPI, {
  calculateEntropy,
  sanitizeCode,
  sanitizeStackTrace
} from '../../shared/privacy/sanitizer.js';
import { loadPIICorpus } from '../mocks/issue-generator';

const SAMPLE_STACK = `TypeError: boom\n    at background/index.js:12:4`;

describe('sanitizer: edge cases', () => {
  it('redacts partial emails without domain', () => {
    const input = 'Error: user@ failed at line 42';
    expect(sanitizeCode(input)).toBe('Error: [REDACTED_EMAIL] failed at line 42');
  });

  it('redacts unicode emails', () => {
    const input = 'Contact 用户@例子.公司 for support';
    expect(sanitizeCode(input)).toContain('[REDACTED_EMAIL]');
  });

  it('redacts data URIs', () => {
    const dataUri = 'const img = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA";';
    expect(sanitizeCode(dataUri)).toContain('[REDACTED_DATA_URI]');
  });

  it('redacts nested JWT tokens in JSON payloads', () => {
    const input = JSON.stringify({ auth: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def' } });
    expect(sanitizeCode(input)).not.toContain('eyJhbGci');
  });

  it('handles multiple PII items in one string', () => {
    const input = 'sk-abcdef1234567890abcdef1234567890 user@example.com 10.0.0.1';
    const sanitized = sanitizeCode(input);
    expect(sanitized).toContain('[REDACTED_API_KEY]');
    expect(sanitized).toContain('[REDACTED_EMAIL]');
    expect(sanitized).toContain('[REDACTED_IP]');
  });

  it('preserves legitimate hex strings and version numbers', () => {
    const input = 'Color: #ffffff, version: 1.2.3';
    expect(sanitizeCode(input)).toBe(input);
  });

  it('redacts chrome extension ids within stack traces', () => {
    const stack = 'Error\n    at chrome-extension://' + 'a'.repeat(32) + '/background.js:1:1';
    expect(sanitizeStackTrace(stack)).toContain('[REDACTED_EXTENSION_ID]');
  });

  it('redacts unix and windows user paths', () => {
    const stack = 'Error\n    at /Users/nathan/src/app.js\n    at C:/Users/Nathan/app.js';
    const sanitized = sanitizeStackTrace(stack);
    expect(sanitized).not.toContain('/Users/nathan');
    expect(sanitized).not.toContain('C:/Users/Nathan');
  });

  it('redacts urls with embedded credentials', () => {
    const input = 'fetch("https://user:pass@example.com/data")';
    expect(sanitizeCode(input)).toContain('[REDACTED_URL]');
  });

  it('redacts high entropy tokens above threshold', () => {
    const token = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6';
    const sanitized = sanitizeCode(token);
    expect(sanitized).toContain('[REDACTED_TOKEN]');
  });

  it('retains low entropy tokens below threshold', () => {
    const token = 'abc123abc123abc123';
    expect(sanitizeCode(token)).toBe(token);
  });

  it('redacts ip addresses in stack trace', () => {
    const stack = 'Error at http://127.0.0.1:3000';
    expect(sanitizeStackTrace(stack)).toContain('[REDACTED_IP]');
  });

  it('redacts plausible analytics keys', () => {
    const input = 'const key = "plausible_abcdefghijklmnopqrstuvwxyz123456";';
    expect(sanitizeCode(input)).toContain('[REDACTED_PLAUSIBLE_KEY]');
  });

  it('sanitizes oauth tokens detected via entropy in stack traces', () => {
    const stack = 'Error\n    at ' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6';
    expect(sanitizeStackTrace(stack)).toContain('[REDACTED_TOKEN]');
  });

  it('sanitizes via sanitizeForAPI helper', async () => {
    const { code, stackTrace } = await sanitizeForAPI('user@example.com', SAMPLE_STACK);
    expect(code).toBe('[REDACTED_EMAIL]');
    expect(stackTrace).toContain('background/index.js');
  });

  it('calculateEntropy detects high entropy strings', () => {
    const highEntropy = calculateEntropy('A5F3c6a11b389df456631183759af3c6a11b389d');
    const lowEntropy = calculateEntropy('aaaaaaaaaaaaaaaaaaaa');
    expect(highEntropy).toBeGreaterThan(lowEntropy);
  });

  it('sanitizes nested JSON structures deeply', () => {
    const payload = '{"user":{"email":"user@example.com","token":"sk-1234567890abcdef1234567890abcdef"}}';
    const sanitized = sanitizeCode(payload);
    expect(sanitized).not.toContain('user@example.com');
    expect(sanitized).toContain('[REDACTED_API_KEY]');
  });

  it('handles empty inputs gracefully', async () => {
    const result = await sanitizeForAPI();
    expect(result.code).toBe('');
    expect(result.stackTrace).toBe('');
  });

  it('does not redact benign urls without credentials', () => {
    const url = 'https://example.com/resource?color=#ffffff';
    expect(sanitizeCode(url)).toBe(url);
  });

  it('strips private key blocks entirely', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----';
    expect(sanitizeCode(key)).toBe('[REDACTED_API_KEY]');
  });

  it('sanitizes PII corpus fixtures comprehensively', () => {
    const corpus = loadPIICorpus();
    const sanitized = sanitizeCode(corpus);
    expect(sanitized).not.toContain('sk-');
    expect(sanitized).not.toContain('eyJ');
    expect(sanitized).not.toContain('C\\\\Users\\\\alice');
    expect(sanitized).not.toContain('user:pass@');
  });

  it('is idempotent when run multiple times', () => {
    const input = 'Contact user@example.com at 10.0.0.1';
    const once = sanitizeCode(input);
    const twice = sanitizeCode(once);
    expect(twice).toBe(once);
  });
});
