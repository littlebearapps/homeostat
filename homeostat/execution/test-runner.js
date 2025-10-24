/**
 * Test gating per IMPLEMENTATION-ROADMAP.md lines 326-350.
 */
import { spawn } from 'child_process';
import { sanitizeStackTrace } from '../../shared/privacy/sanitizer.js';

export async function runTests({ command = 'npm test', cwd = process.cwd(), env = process.env } = {}) {
  const child = spawn(command, { shell: true, cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data.toString();
  });
  child.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  const combinedOutput = `${stdout}\n${stderr}`.trim();
  const sanitizedOutput = sanitizeStackTrace(combinedOutput);

  if (exitCode !== 0) {
    return {
      passed: false,
      output: sanitizedOutput,
      shouldEscalate: true
    };
  }

  return {
    passed: true,
    output: sanitizedOutput,
    shouldEscalate: false
  };
}

export default { runTests };
