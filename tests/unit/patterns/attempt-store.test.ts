import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AttemptStore } from '../../../shared/patterns/attempt-store.js';

let tempDir: string;
let now = new Date('2025-01-01T00:00:00Z');

function advanceHours(hours: number) {
  now = new Date(now.getTime() + hours * 60 * 60 * 1000);
}

describe('AttemptStore', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'attempt-store-'));
    now = new Date('2025-01-01T00:00:00Z');
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('enforces exponential cooldown and exhaustion', async () => {
    const store = new AttemptStore({
      storageDir: tempDir,
      now: () => now
    });

    const fingerprint = 'abc123';

    expect(await store.canAttempt(fingerprint)).toBe(true);

    await store.recordAttempt(fingerprint, false);
    let state = await store.getState(fingerprint);
    expect(state.attempts).toBe(1);
    expect(state.cooldownUntil).toBeDefined();

    advanceHours(23);
    expect(await store.canAttempt(fingerprint)).toBe(false);

    advanceHours(2);
    expect(await store.canAttempt(fingerprint)).toBe(true);

    await store.recordAttempt(fingerprint, false);
    state = await store.getState(fingerprint);
    expect(state.attempts).toBe(2);

    const firstCooldown = new Date(state.cooldownUntil ?? '');
    expect(firstCooldown.getTime()).toBeGreaterThan(now.getTime());

    advanceHours(48);
    await store.recordAttempt(fingerprint, false);
    state = await store.getState(fingerprint);
    expect(state.exhausted).toBe(true);
    expect(await store.canAttempt(fingerprint)).toBe(false);
  });

  it('resets attempts after success', async () => {
    const store = new AttemptStore({
      storageDir: tempDir,
      now: () => now
    });

    const fingerprint = 'reset-me';
    await store.recordAttempt(fingerprint, false);
    await store.recordAttempt(fingerprint, true);

    const state = await store.getState(fingerprint);
    expect(state.attempts).toBe(0);
    expect(state.cooldownUntil).toBeUndefined();
    expect(state.history.at(-1)?.success).toBe(true);
  });
});
