import { describe, expect, it } from 'vitest';
import { FailureFingerprinter } from '../../../shared/patterns/fingerprinter.js';

const STACK = `Error: Something failed\n    at Object.<anonymous> (/app/src/index.ts:42:13)\n    at Module._compile (node:internal/modules/cjs/loader:1234:32)`;

describe('FailureFingerprinter', () => {
  it('normalizes dynamic values to produce stable fingerprint ids', () => {
    const first = FailureFingerprinter.normalize({
      type: 'TypeError',
      message:
        'Unexpected token 1234 at 2024-10-10 12:30:45 requestId=123e4567-e89b-12d3-a456-426614174000 hash=abcdefabcdefabcdefabcdefabcdefab',
      stack: STACK
    });

    const second = FailureFingerprinter.normalize({
      type: 'TypeError',
      message:
        'Unexpected token 5678 at 2025-01-11 05:10:45 requestId=987e6543-e21b-43d2-a456-426614174001 hash=1234567890abcdef1234567890abcdef',
      stack: STACK
    });

    expect(second.id).toBe(first.id);
    expect(second.messageHash).toBe(first.messageHash);
    expect(first.fullSignature).toContain(first.messageHash);
  });

  it('extracts the top stack frame path', () => {
    const fingerprint = FailureFingerprinter.normalize({
      type: 'ReferenceError',
      message: 'window is not defined',
      stack: STACK
    });

    expect(fingerprint.filePath).toBe('/app/src/index.ts');
    expect(fingerprint.topStackFrame).toBe('Error: Something failed');
  });

  it('falls back to unknown when stack trace is missing', () => {
    const fingerprint = FailureFingerprinter.normalize({
      type: 'Error',
      message: 'boom',
      stack: 'Error: boom'
    });

    expect(fingerprint.filePath).toBe('unknown');
    expect(fingerprint.id).toHaveLength(12);
  });
});
