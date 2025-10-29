#!/usr/bin/env tsx
/**
 * Check budget status script
 *
 * Usage: npm run budget:status
 */

import { BudgetStore } from '../shared/budget/store.js';

async function main() {
  const store = new BudgetStore();
  const state = await store.load();

  console.log('\n📊 Budget Status');
  console.log('================\n');

  // Daily
  const dailyUsage = (state.periods.daily.spent / state.periods.daily.cap) * 100;
  console.log('Daily:');
  console.log(`  Spent:     $${state.periods.daily.spent.toFixed(4)}`);
  console.log(`  Cap:       $${state.periods.daily.cap.toFixed(4)}`);
  console.log(`  Remaining: $${state.periods.daily.remaining.toFixed(4)}`);
  console.log(`  Reserved:  $${state.periods.daily.reserved.toFixed(4)}`);
  console.log(`  Usage:     ${dailyUsage.toFixed(1)}%`);
  console.log(`  Resets:    ${new Date(state.periods.daily.resetAt).toLocaleString()}`);
  console.log('');

  // Weekly
  const weeklyUsage = (state.periods.weekly.spent / state.periods.weekly.cap) * 100;
  console.log('Weekly:');
  console.log(`  Spent:     $${state.periods.weekly.spent.toFixed(4)}`);
  console.log(`  Cap:       $${state.periods.weekly.cap.toFixed(4)}`);
  console.log(`  Remaining: $${state.periods.weekly.remaining.toFixed(4)}`);
  console.log(`  Reserved:  $${state.periods.weekly.reserved.toFixed(4)}`);
  console.log(`  Usage:     ${weeklyUsage.toFixed(1)}%`);
  console.log(`  Resets:    ${new Date(state.periods.weekly.resetAt).toLocaleString()}`);
  console.log('');

  // Monthly
  const monthlyUsage = (state.periods.monthly.spent / state.periods.monthly.cap) * 100;
  console.log('Monthly:');
  console.log(`  Spent:     $${state.periods.monthly.spent.toFixed(4)}`);
  console.log(`  Cap:       $${state.periods.monthly.cap.toFixed(4)}`);
  console.log(`  Remaining: $${state.periods.monthly.remaining.toFixed(4)}`);
  console.log(`  Reserved:  $${state.periods.monthly.reserved.toFixed(4)}`);
  console.log(`  Usage:     ${monthlyUsage.toFixed(1)}%`);
  console.log(`  Resets:    ${new Date(state.periods.monthly.resetAt).toLocaleString()}`);
  console.log('');

  // Check for alerts
  const alerts = await store.checkThresholds();
  if (alerts.length > 0) {
    console.log('⚠️  Alerts:');
    for (const alert of alerts) {
      const emoji = alert.level === 100 ? '🔴' : alert.level === 90 ? '🟠' : '🟡';
      console.log(`  ${emoji} ${alert.period} at ${alert.usagePercent.toFixed(1)}% (${alert.level}% threshold)`);
    }
    console.log('');
  }

  console.log(`Last updated: ${new Date(state.lastUpdated).toLocaleString()}\n`);
}

main().catch((error) => {
  console.error('Error checking budget status:', error);
  process.exit(1);
});
