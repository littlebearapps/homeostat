import fc from 'fast-check';
import { describe, it, expect } from 'vitest';
import { sanitizeCode, sanitizeStackTrace } from '../../shared/privacy/sanitizer.js';

const piiPatterns = [
  /sk-[a-z0-9]{10,}/i,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  /\/Users\//,
  /C:\\Users\\/
];

describe('sanitizer property tests', () => {
  it('removes known PII patterns from random strings', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const sanitized = sanitizeCode(value);
        piiPatterns.forEach((pattern) => {
          expect(sanitized).not.toMatch(pattern);
        });
      })
    );
  });

  it('preserves structure by keeping line counts stable', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const sanitized = sanitizeStackTrace(value);
        const originalLines = value.split('\n').length;
        const sanitizedLines = sanitized.split('\n').length;
        expect(sanitizedLines).toBe(originalLines);
      })
    );
  });

  it('is idempotent for stack traces', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const once = sanitizeStackTrace(value);
        const twice = sanitizeStackTrace(once);
        expect(twice).toBe(once);
      })
    );
  });
});
