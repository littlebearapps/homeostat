# Observability Integration Example

The snippet below demonstrates how to tie together structured logging, metrics, cost tracking, and SLO alerting when executing a fix attempt.

```typescript
import { StructuredLogger } from '../../shared/observability/logger.js';
import { metrics } from '../../shared/observability/metrics.js';
import { alertManager } from '../../shared/observability/alerts.js';
import { CostTracker } from '../../shared/cost/tracker.js';

export async function executeFixWithObservability(issue: any, routing: any) {
  const runLogger = new StructuredLogger({
    issueNumber: issue.number,
    tier: routing.tier,
    stage: 'execute'
  });

  const costTracker = new CostTracker();

  runLogger.info('Starting fix attempt', { model: routing.model });

  try {
    const start = Date.now();
    const result = await executeFixAttempt(issue, routing);

    const durationMs = Date.now() - start;
    const costSnapshot = costTracker.getTotalCost();

    metrics.recordFix(routing.tier, result.success, costSnapshot);
    if (result.retried) {
      metrics.recordRetry(result.escalated);
    }

    runLogger.info('Fix completed', {
      success: result.success,
      attempts: result.attempts,
      durationMs,
      cost: costSnapshot
    });

    const alerts = alertManager.checkSLOs(
      metrics.metrics,
      costTracker.projectAnnualCost()
    );

    alerts.forEach((alert) => alertManager.sendAlert(alert));

    return result;
  } catch (error) {
    metrics.recordFix(routing.tier, false, 0);
    runLogger.error('Fix failed', error as Error);
    throw error;
  }
}
```

This pattern keeps logs structured, metrics up to date, and alerts actionable without leaking PII.
