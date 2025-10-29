#!/usr/bin/env tsx
/**
 * Reset budget script (manual reset for testing/admin)
 *
 * Usage: npm run budget:reset
 * WARNING: This will reset all budget periods to zero spent!
 */

import { BudgetStore } from '../shared/budget/store.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

async function main() {
  console.log('\n⚠️  Budget Reset');
  console.log('===============\n');
  console.log('WARNING: This will reset all budget periods (daily, weekly, monthly) to zero spent.\n');

  // Check if running in CI (don't prompt)
  if (!process.env.CI) {
    console.log('Press Ctrl+C to cancel, or Enter to continue...');
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => resolve());
    });
  }

  const store = new BudgetStore();
  const state = await store.load();

  console.log('Before reset:');
  console.log(`  Daily:   $${state.periods.daily.spent.toFixed(4)} spent`);
  console.log(`  Weekly:  $${state.periods.weekly.spent.toFixed(4)} spent`);
  console.log(`  Monthly: $${state.periods.monthly.spent.toFixed(4)} spent`);
  console.log('');

  // Reset all periods
  state.periods.daily.spent = 0;
  state.periods.daily.reserved = 0;
  state.periods.daily.remaining = state.periods.daily.cap;

  state.periods.weekly.spent = 0;
  state.periods.weekly.reserved = 0;
  state.periods.weekly.remaining = state.periods.weekly.cap;

  state.periods.monthly.spent = 0;
  state.periods.monthly.reserved = 0;
  state.periods.monthly.remaining = state.periods.monthly.cap;

  // Save state
  const statePath = '.homeostat/state/budget.json';
  await fs.mkdir(join(process.cwd(), '.homeostat/state'), { recursive: true });
  await fs.writeFile(
    join(process.cwd(), statePath),
    JSON.stringify(state, null, 2)
  );

  console.log('After reset:');
  console.log(`  Daily:   $${state.periods.daily.spent.toFixed(4)} spent`);
  console.log(`  Weekly:  $${state.periods.weekly.spent.toFixed(4)} spent`);
  console.log(`  Monthly: $${state.periods.monthly.spent.toFixed(4)} spent`);
  console.log('');

  console.log('✅ Budget reset complete!\n');
  console.log('NOTE: If in GitHub Actions, remember to commit and push the state file.\n');
}

main().catch((error) => {
  console.error('Error resetting budget:', error);
  process.exit(1);
});
