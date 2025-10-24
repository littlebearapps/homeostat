import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FailureFingerprinter } from '../../../shared/patterns/fingerprinter.js';
import { PatternExtractor } from '../../../shared/patterns/extractor.js';

const baseError = {
  type: 'RangeError',
  message: 'Maximum call stack size exceeded',
  stack: 'RangeError\n    at recurse (/workspace/src/app.ts:20:10)'
};

const fingerprint = FailureFingerprinter.normalize(baseError);

let tempDir: string;
let libraryPath: string;

describe('PatternExtractor', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pattern-extractor-'));
    libraryPath = path.join(tempDir, 'library.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('returns null when feature flag disables extraction', async () => {
    const extractor = new PatternExtractor({ env: 'dev', libraryPath });
    const result = await extractor.extract({ fingerprint, patch: 'diff --git' });
    expect(result).toBeNull();
    await expect(fs.readFile(libraryPath, 'utf8')).rejects.toThrow();
  });

  it('extracts and deduplicates patterns in production', async () => {
    const extractor = new PatternExtractor({ env: 'production', libraryPath });
    const first = await extractor.extract({ fingerprint, patch: 'diff --git' });
    expect(first).toBeTruthy();

    const second = await extractor.extract({ fingerprint, patch: 'diff --git' });
    expect(second?.id).toBe(first?.id);

    const library = JSON.parse(await fs.readFile(libraryPath, 'utf8'));
    expect(library.patterns).toHaveLength(1);
    expect(library.metadata.totalPatterns).toBe(1);
  });
});
