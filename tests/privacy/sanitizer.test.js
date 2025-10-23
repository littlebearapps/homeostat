import { describe, expect, it } from 'vitest';
import sanitizeForAPI, {
  calculateEntropy,
  sanitizeCode,
  sanitizeStackTrace
} from '../../shared/privacy/sanitizer.js';

describe('PII Sanitization Engine', () => {
  it('redacts chrome extension IDs', () => {
    const code = 'const url = "chrome-extension://abcdefghijklmnopqrstuvwxyz123456";';
    const sanitized = sanitizeCode(code);
    expect(sanitized).toContain('[REDACTED_EXTENSION_ID]');
  });

  it('redacts emails', () => {
    const sanitized = sanitizeCode('contact@littlebearapps.com');
    expect(sanitized).toBe('[REDACTED_EMAIL]');
  });

  it('redacts OpenAI API keys', () => {
    const sanitized = sanitizeCode('const key = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234";');
    expect(sanitized).toContain('[REDACTED_API_KEY]');
  });

  it('redacts Stripe API keys', () => {
    const sanitized = sanitizeCode('const stripe = "sk_live_abcdefghijklmnopqrstuvwxyz123456";');
    expect(sanitized).toContain('[REDACTED_API_KEY]');
  });

  it('redacts GitHub tokens', () => {
    const sanitized = sanitizeCode(`const github = "ghp_${'a'.repeat(36)}";`);
    expect(sanitized).toContain('[REDACTED_GITHUB_TOKEN]');
  });

  it('redacts Google API keys', () => {
    const sanitized = sanitizeCode('const g = "AIzaABCDEFGHIJKLMNOPQRSTUVWXY0123456789";');
    expect(sanitized).toContain('[REDACTED_API_KEY]');
  });

  it('redacts JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvZSIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const sanitized = sanitizeCode(jwt);
    expect(sanitized).toBe('[REDACTED_JWT]');
  });

  it('redacts Linear API keys', () => {
    const sanitized = sanitizeCode('lin_api_abcdefghijklmnopqrstuvwxyz1234567890abcd');
    expect(sanitized).toBe('[REDACTED_LINEAR_KEY]');
  });

  it('redacts Plausible API keys', () => {
    const sanitized = sanitizeCode('plausible_abcdefghijklmnopqrstuvwxyz_123456');
    expect(sanitized).toBe('[REDACTED_PLAUSIBLE_KEY]');
  });

  it('redacts IPv4 and IPv6 addresses', () => {
    const sanitized = sanitizeCode('const host = "192.168.1.10"; const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";');
    expect(sanitized).not.toContain('192.168.1.10');
    expect(sanitized).not.toContain('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    expect(sanitized.match(/\[REDACTED_IP\]/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('redacts URLs with credentials', () => {
    const sanitized = sanitizeCode('fetch("https://user:pass@example.com/api")');
    expect(sanitized).toContain('[REDACTED_URL]@example.com');
  });

  it('redacts private key blocks', () => {
    const keyBlock = `-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----`;
    const sanitized = sanitizeCode(keyBlock);
    expect(sanitized).toBe('[REDACTED_API_KEY]');
  });

  it('redacts user paths across platforms', () => {
    const stack = 'at /Users/nathan/project/file.js:10:5\nat /home/user/app.js:2:3\nat C:/Users/Nathan/app.js:2:3';
    const sanitized = sanitizeStackTrace(stack);
    expect(sanitized).toContain('[REDACTED_USER_PATH]/project/file.js:10:5');
    expect(sanitized).toContain('[REDACTED_USER_PATH]/app.js:2:3');
    expect(sanitized).toContain('[REDACTED_WINDOWS_USER_PATH]/app.js:2:3');
  });

  it('detects high entropy OAuth tokens', () => {
    const token = 'A'.repeat(20) + 'B'.repeat(20); // entropy ~1 -> should not redact
    const highEntropy = 'b1C2d3E4f5G6h7I8j9K0l1M2n3O4p5Q6r7S8t9U0v1W2x3Y4z5';
    const mixed = `${token} ${highEntropy}`;
    const sanitized = sanitizeCode(mixed);
    expect(sanitized).toContain(token.trim());
    expect(sanitized).toContain('[REDACTED_TOKEN]');
  });

  it('preserves non-sensitive code', () => {
    const code = 'function sum(a, b) { return a + b; }';
    expect(sanitizeCode(code)).toBe(code);
  });

  it('sanitizes both code and stack trace via sanitizeForAPI', async () => {
    const payload = {
      code: 'const key = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234";\nconst email = "user@example.com";\nconst url = "https://user:pass@secure.dev";',
      stack: 'Error at chrome-extension://abcdefghijklmnopqrstuvwxyz123456/scripts.js\nat /Users/tester/app.js:1:1\nCaused by 10.0.0.1'
    };
    const sanitized = await sanitizeForAPI(payload.code, payload.stack);
    expect(sanitized.code).not.toContain('sk-');
    expect(sanitized.code).not.toContain('user@example.com');
    expect(sanitized.stackTrace).not.toContain('chrome-extension://');
    expect(sanitized.stackTrace).not.toContain('10.0.0.1');
    expect(sanitized.stackTrace).toContain('[REDACTED_USER_PATH]/app.js:1:1');
  });

  it('maintains nested tokens in same string', () => {
    const code = 'const cfg = "sk-1234567890abcdefghijklmnopqrstuvwxyz1234@github_pat_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcd";';
    const sanitized = sanitizeCode(code);
    expect(sanitized).not.toMatch(/sk-/);
    expect(sanitized).not.toMatch(/github_pat_/);
  });
});

describe('calculateEntropy', () => {
  it('calculates entropy close to zero for uniform characters', () => {
    expect(calculateEntropy('AAAAAA')).toBeCloseTo(0, 5);
  });

  it('calculates higher entropy for diverse strings', () => {
    const entropy = calculateEntropy('abcdef123456');
    expect(entropy).toBeGreaterThan(3);
  });
});
