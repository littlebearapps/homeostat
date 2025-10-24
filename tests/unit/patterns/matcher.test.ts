import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { FailureFingerprinter } from '../../../shared/patterns/fingerprinter.js';
import { PatternMatcher } from '../../../shared/patterns/matcher.js';

const baseError = {
  type: 'TypeError',
  message: 'Cannot read properties of undefined (reading "value")',
  stack: 'TypeError\n    at Object.<anonymous> (/workspace/src/app.ts:10:5)'
};

const baseFingerprint = FailureFingerprinter.normalize(baseError);

let tempFile: string;

async function writeLibrary(patterns: unknown) {
  await fs.writeFile(tempFile, JSON.stringify({ version: 1, patterns, metadata: {} }), 'utf8');
}

describe('PatternMatcher', () => {
  beforeEach(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pattern-matcher-'));
    tempFile = path.join(dir, 'library.json');
  });

  it('returns null when library is empty', async () => {
    await writeLibrary([]);
    const matcher = await PatternMatcher.fromFile(tempFile);
    expect(matcher.match(baseFingerprint)).toBeNull();
  });

  it('performs exact fingerprint matching', async () => {
    await writeLibrary([
      {
        id: 'pattern-1',
        fingerprintId: baseFingerprint.id,
        errorType: baseFingerprint.errorType,
        filePath: baseFingerprint.filePath,
        patch: 'diff --git',
        confidence: 0.9,
        successRate: 0.9,
        uses: 4
      }
    ]);

    const matcher = await PatternMatcher.fromFile(tempFile);
    const result = matcher.match(baseFingerprint);
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('exact');
    expect(result?.pattern.id).toBe('pattern-1');
  });

  it('performs fuzzy matching when fingerprint differs', async () => {
    await writeLibrary([
      {
        id: 'pattern-2',
        fingerprintId: 'other',
        errorType: baseFingerprint.errorType,
        filePath: baseFingerprint.filePath,
        patch: 'diff --git',
        successRate: 0.95,
        uses: 8
      }
    ]);

    const matcher = await PatternMatcher.fromFile(tempFile);
    const result = matcher.match(baseFingerprint);
    expect(result).not.toBeNull();
    expect(result?.strategy).toBe('fuzzy');
    expect(result?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('respects confidence threshold', async () => {
    await writeLibrary([
      {
        id: 'pattern-low',
        fingerprintId: 'other',
        errorType: baseFingerprint.errorType,
        filePath: baseFingerprint.filePath,
        patch: 'diff --git',
        confidence: 0.5,
        uses: 1
      }
    ]);

    const matcher = await PatternMatcher.fromFile(tempFile);
    expect(matcher.match(baseFingerprint)).toBeNull();
  });
});
