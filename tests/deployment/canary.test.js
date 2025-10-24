import { describe, expect, it, vi } from 'vitest';
import {
  CANARY_STAGES,
  deploy,
  monitorErrors,
  rollback
} from '../../homeostat/deployment/canary.js';

describe('canary deploy', () => {
  it('progresses through each stage when error rate acceptable', async () => {
    const updates = [];
    const monitor = vi.fn().mockResolvedValue(0.0);
    const comment = vi.fn();
    const result = await deploy(101, {
      stages: CANARY_STAGES,
      updateConfig: async ({ percentage }) => updates.push(percentage),
      monitor,
      comment,
      fetchImpl: vi.fn()
    });
    expect(result.success).toBe(true);
    expect(updates).toEqual([1, 5, 25, 100]);
    expect(comment).toHaveBeenCalled();
  });

  it('rolls back when error rate exceeds threshold', async () => {
    const updates = [];
    const monitor = vi
      .fn()
      .mockResolvedValueOnce(0.0)
      .mockResolvedValueOnce(0.03);
    const comment = vi.fn();
    const result = await deploy(55, {
      stages: CANARY_STAGES,
      updateConfig: async ({ percentage }) => updates.push(percentage),
      monitor,
      comment,
      fetchImpl: vi.fn(),
      version: '1.0.1'
    });
    expect(result.success).toBe(false);
    expect(updates).toEqual([1, 5, 0]);
    expect(comment).toHaveBeenCalled();
  });
});

describe('monitorErrors', () => {
  it('returns zero when no metrics configured', async () => {
    const rate = await monitorErrors('1h', { fetchImpl: vi.fn(), metricsUrl: undefined });
    expect(rate).toBe(0);
  });
});

describe('rollback', () => {
  it('invokes update and comment hooks', async () => {
    const update = vi.fn();
    const comment = vi.fn();
    await rollback(88, { updateConfig: update, comment, fetchImpl: vi.fn() });
    expect(update).toHaveBeenCalledWith({ percentage: 0, version: undefined }, 88);
    expect(comment).toHaveBeenCalled();
  });
});
