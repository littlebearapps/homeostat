import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSONLLogger } from '../../../homeostat/telemetry/jsonl-logger.js';

describe('JSONLLogger', () => {
  let tempDir: string;
  let originalArtifactsPath: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsonl-logger-'));
    originalArtifactsPath = process.env.HOMEOSTAT_ARTIFACTS_PATH;
    process.env.HOMEOSTAT_ARTIFACTS_PATH = tempDir;
  });

  afterEach(() => {
    if (originalArtifactsPath === undefined) {
      delete process.env.HOMEOSTAT_ARTIFACTS_PATH;
    } else {
      process.env.HOMEOSTAT_ARTIFACTS_PATH = originalArtifactsPath;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes metrics to JSONL artifacts', () => {
    const now = new Date().toISOString();

    JSONLLogger.logRunMetrics({
      timestamp: now,
      repo: 'littlebearapps/example',
      fingerprintsProcessed: ['fp-1'],
      prsCreated: 1,
      prsUpdated: 0,
      cooldowns: 0,
      cost: 0.25,
      tokens: { input: 120, output: 60, cacheRead: 0, cacheWrite: 0 },
      latency: 1500,
      errors: [],
      patternsUsed: 1,
      zeroCostFixes: 1
    });

    const files = fs.readdirSync(tempDir);
    expect(files).toHaveLength(1);

    const entry = fs.readFileSync(path.join(tempDir, files[0]), 'utf8').trim();
    const parsed = JSON.parse(entry);
    expect(parsed.repo).toBe('littlebearapps/example');
    expect(parsed.fingerprintsProcessed).toEqual(['fp-1']);
    expect(parsed.cost).toBeCloseTo(0.25, 5);
  });

  it('aggregates metrics since a timestamp', async () => {
    const past = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();

    JSONLLogger.logRunMetrics({
      timestamp: past,
      repo: 'littlebearapps/example',
      fingerprintsProcessed: ['old'],
      prsCreated: 0,
      prsUpdated: 1,
      cooldowns: 0,
      cost: 0.1,
      tokens: { input: 80, output: 20, cacheRead: 0, cacheWrite: 0 },
      latency: 500,
      errors: ['timeout'],
      patternsUsed: 0,
      zeroCostFixes: 0
    });

    JSONLLogger.logRunMetrics({
      timestamp: recent,
      repo: 'littlebearapps/example',
      fingerprintsProcessed: ['new'],
      prsCreated: 1,
      prsUpdated: 0,
      cooldowns: 0,
      cost: 0.2,
      tokens: { input: 50, output: 25, cacheRead: 0, cacheWrite: 0 },
      latency: 250,
      errors: [],
      patternsUsed: 1,
      zeroCostFixes: 1
    });

    const metrics = await JSONLLogger.aggregateMetrics(new Date(Date.now() - 60 * 1000));
    expect(metrics.totalCost).toBeCloseTo(0.2, 5);
    expect(metrics.totalPRs).toBe(1);
    expect(metrics.totalTokens).toBe(75);
    expect(metrics.avgLatency).toBeCloseTo(250, 5);
    expect(metrics.errorRate).toBe(0);
  });
});
