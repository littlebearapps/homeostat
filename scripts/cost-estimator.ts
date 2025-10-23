import { CostTracker } from '../shared/cost/tracker';

const tracker = new CostTracker();

tracker.trackUsage({ model: 'deepseek', inputTokens: 800, outputTokens: 400, issueNumber: 1, tier: 1 });
tracker.trackUsage({ model: 'deepseek', inputTokens: 2000, outputTokens: 400, issueNumber: 2, tier: 2 });
tracker.trackUsage({ model: 'gpt5', inputTokens: 0, outputTokens: 200, issueNumber: 2, tier: 2 });
tracker.trackUsage({ model: 'gpt5', inputTokens: 400, outputTokens: 150, issueNumber: 3, tier: 3 });

const metrics = tracker.exportMetrics();

console.log('💰 Cost Metrics:');
console.log(JSON.stringify(metrics, null, 2));

const meetsTarget = metrics.projectedAnnualCost <= 9.28;
console.log(`\n${meetsTarget ? '✅' : '❌'} Target: $9.28/year`);
console.log(`📊 Projected: $${metrics.projectedAnnualCost.toFixed(2)}/year`);
