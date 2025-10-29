#!/usr/bin/env tsx
/**
 * Reset rate limiter script (manual reset for testing/admin)
 *
 * Usage: npm run ratelimit:reset
 * WARNING: This will clear all rate limit timestamps!
 */

import { RateLimiter } from '../shared/rate-limit/limiter.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log('\n⚠️  Rate Limit Reset');
  console.log('==================\n');
  console.log('WARNING: This will clear all rate limit timestamps (per-minute and per-day).\n');

  // Check if running in CI (don't prompt)
  if (!process.env.CI) {
    console.log('Press Ctrl+C to cancel, or Enter to continue...');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  const limiter = new RateLimiter();
  const state = await limiter.load();

  console.log('Before reset:');
  console.log(`  Per-minute: ${state.windows.perMinute.timestamps.length} attempts`);
  console.log(`  Per-day:    ${state.windows.perDay.timestamps.length} attempts`);
  console.log('');

  // Clear all timestamps
  state.windows.perMinute.timestamps = [];
  state.windows.perDay.timestamps = [];
  state.lastPrunedAt = new Date().toISOString();

  // Save state
  const statePath = '.homeostat/state/rate_limiter.json';
  await fs.mkdir(join(process.cwd(), '.homeostat/state'), { recursive: true });
  await fs.writeFile(
    join(process.cwd(), statePath),
    JSON.stringify(state, null, 2)
  );

  console.log('After reset:');
  console.log(`  Per-minute: ${state.windows.perMinute.timestamps.length} attempts`);
  console.log(`  Per-day:    ${state.windows.perDay.timestamps.length} attempts`);
  console.log('');

  console.log('✅ Rate limit reset complete!\n');
  console.log('NOTE: If in GitHub Actions, remember to commit and push the state file.\n');
}

main().catch((error) => {
  console.error('Error resetting rate limiter:', error);
  process.exit(1);
});
