#!/usr/bin/env tsx
/**
 * Check rate limit status script
 *
 * Usage: npm run ratelimit:status
 */

import { RateLimiter } from '../shared/rate-limit/limiter.js';

async function main() {
  const limiter = new RateLimiter();
  const state = await limiter.getStatus();
  const check = await limiter.canProceed();

  console.log('\n⏱️  Rate Limit Status');
  console.log('===================\n');

  // Per-minute window
  console.log('Per-Minute (Burst Protection):');
  console.log(`  Current:   ${check.current.perMinute}/${check.limits.perMinute} attempts`);
  console.log(`  Status:    ${check.allowed ? '✅ Available' : '🔴 Rate limited'}`);
  console.log(`  Resets:    ${new Date(check.resetsAt.perMinute).toLocaleString()}`);
  if (state.windows.perMinute.timestamps.length > 0) {
    const oldest = new Date(state.windows.perMinute.timestamps[0]);
    const newest = new Date(state.windows.perMinute.timestamps[state.windows.perMinute.timestamps.length - 1]);
    console.log(`  Window:    ${oldest.toLocaleTimeString()} - ${newest.toLocaleTimeString()}`);
  }
  console.log('');

  // Per-day window
  console.log('Per-Day (Throughput Control):');
  console.log(`  Current:   ${check.current.perDay}/${check.limits.perDay} attempts`);
  console.log(`  Status:    ${check.allowed ? '✅ Available' : '🔴 Rate limited'}`);
  console.log(`  Resets:    ${new Date(check.resetsAt.perDay).toLocaleString()}`);
  if (state.windows.perDay.timestamps.length > 0) {
    const oldest = new Date(state.windows.perDay.timestamps[0]);
    const newest = new Date(state.windows.perDay.timestamps[state.windows.perDay.timestamps.length - 1]);
    console.log(`  Window:    ${oldest.toLocaleString()} - ${newest.toLocaleString()}`);
  }
  console.log('');

  if (!check.allowed) {
    console.log(`⚠️  ${check.reason}\n`);
  }

  console.log(`Last pruned: ${new Date(state.lastPrunedAt).toLocaleString()}\n`);
}

main().catch((error) => {
  console.error('Error checking rate limit status:', error);
  process.exit(1);
});
