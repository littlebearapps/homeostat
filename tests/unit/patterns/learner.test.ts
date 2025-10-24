import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PatternLearner } from '../../../shared/patterns/learner.js';

let tempDir: string;
let libraryPath: string;

async function writeLibrary(data: unknown) {
  await fs.writeFile(libraryPath, JSON.stringify(data, null, 2), 'utf8');
}

describe('PatternLearner', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pattern-learner-'));
    libraryPath = path.join(tempDir, 'library.json');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('does nothing when not in production', async () => {
    await writeLibrary({
      version: 1,
      patterns: [
        {
          id: 'p1',
          fingerprintId: 'fp',
          errorType: 'TypeError',
          filePath: 'src/app.ts',
          patch: 'diff',
          successRate: 0.5,
          uses: 2
        }
      ]
    });

    const learner = new PatternLearner({ env: 'dev', libraryPath });
    await learner.learn({ patternId: 'p1', success: true });

    const library = JSON.parse(await fs.readFile(libraryPath, 'utf8'));
    expect(library.patterns[0].uses).toBe(2);
  });

  it('updates success rate with exponential moving average', async () => {
    await writeLibrary({
      version: 1,
      patterns: [
        {
          id: 'p2',
          fingerprintId: 'fp',
          errorType: 'TypeError',
          filePath: 'src/app.ts',
          patch: 'diff',
          successRate: 0.5,
          uses: 5
        }
      ],
      metadata: {}
    });

    const learner = new PatternLearner({ env: 'production', libraryPath, alpha: 0.1 });
    await learner.learn({ patternId: 'p2', success: true });

    const library = JSON.parse(await fs.readFile(libraryPath, 'utf8'));
    const pattern = library.patterns.find((entry: any) => entry.id === 'p2');
    expect(pattern.uses).toBe(6);
    expect(pattern.successRate).toBeGreaterThan(0.5);
  });

  it('retires low performing patterns after repeated failures', async () => {
    await writeLibrary({
      version: 1,
      patterns: [
        {
          id: 'p3',
          fingerprintId: 'fp',
          errorType: 'TypeError',
          filePath: 'src/app.ts',
          patch: 'diff',
          successRate: 0.4,
          uses: 10
        }
      ],
      metadata: {}
    });

    const learner = new PatternLearner({ env: 'production', libraryPath, alpha: 0.1 });
    await learner.learn({ patternId: 'p3', success: false });

    const library = JSON.parse(await fs.readFile(libraryPath, 'utf8'));
    expect(library.patterns).toHaveLength(0);
  });
});
