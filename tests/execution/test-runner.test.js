import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as childProcess from 'node:child_process';
import { runTests } from '../../homeostat/execution/test-runner.js';

vi.mock('node:child_process');

describe('runTests', () => {
  const spawnMock = childProcess.spawn;

  it('returns success when exit code is zero', async () => {
    const emitter = new EventEmitter();
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();
    spawnMock.mockReturnValue(emitter);

    const promise = runTests({ command: 'echo "ok"' });
    emitter.stdout.emit('data', 'All good');
    emitter.stderr.emit('data', '');
    emitter.emit('close', 0);
    const result = await promise;
    expect(result.passed).toBe(true);
    expect(result.shouldEscalate).toBe(false);
  });

  it('sanitizes output and escalates on failure', async () => {
    const emitter = new EventEmitter();
    emitter.stdout = new EventEmitter();
    emitter.stderr = new EventEmitter();
    spawnMock.mockReturnValue(emitter);

    const promise = runTests();
    emitter.stderr.emit('data', 'at /Users/tester/project/file.js:1:1');
    emitter.emit('close', 1);
    const result = await promise;
    expect(result.passed).toBe(false);
    expect(result.shouldEscalate).toBe(true);
    expect(result.output).toContain('[REDACTED_USER_PATH]/project/file.js:1:1');
    expect(result.output).not.toContain('/Users/tester');
  });
});
