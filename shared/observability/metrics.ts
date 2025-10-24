export interface Metrics {
  fixes: {
    total: number;
    byTier: { tier1: number; tier2: number; tier3: number };
    successful: number;
    failed: number;
  };
  retries: {
    total: number;
    escalations: number;
  };
  sanitization: {
    totalRedactions: number;
    byType: Record<string, number>;
  };
  cost: {
    total: number;
    byTier: { tier1: number; tier2: number; tier3: number };
  };
}

function createEmptyMetrics(): Metrics {
  return {
    fixes: {
      total: 0,
      byTier: { tier1: 0, tier2: 0, tier3: 0 },
      successful: 0,
      failed: 0
    },
    retries: { total: 0, escalations: 0 },
    sanitization: { totalRedactions: 0, byType: {} },
    cost: { total: 0, byTier: { tier1: 0, tier2: 0, tier3: 0 } }
  };
}

export class MetricsCollector {
  private readonly metrics: Metrics;

  constructor(initialMetrics: Metrics = createEmptyMetrics()) {
    this.metrics = initialMetrics;
  }

  recordFix(tier: number, success: boolean, cost: number) {
    const tierKey = `tier${tier}` as const;

    this.metrics.fixes.total += 1;
    if (tierKey in this.metrics.fixes.byTier) {
      this.metrics.fixes.byTier[tierKey] += 1;
    }

    if (success) {
      this.metrics.fixes.successful += 1;
    } else {
      this.metrics.fixes.failed += 1;
    }

    this.metrics.cost.total += cost;
    if (tierKey in this.metrics.cost.byTier) {
      this.metrics.cost.byTier[tierKey] += cost;
    }
  }

  recordRetry(escalated = false) {
    this.metrics.retries.total += 1;
    if (escalated) {
      this.metrics.retries.escalations += 1;
    }
  }

  recordRedaction(type: string) {
    this.metrics.sanitization.totalRedactions += 1;
    this.metrics.sanitization.byType[type] =
      (this.metrics.sanitization.byType[type] ?? 0) + 1;
  }

  getSuccessRate(): number {
    if (this.metrics.fixes.total === 0) {
      return 0;
    }
    return this.metrics.fixes.successful / this.metrics.fixes.total;
  }

  getSnapshot(): Metrics {
    return JSON.parse(JSON.stringify(this.metrics)) as Metrics;
  }

  get metrics(): Metrics {
    return this.getSnapshot();
  }

  reset() {
    const fresh = createEmptyMetrics();
    Object.assign(this.metrics.fixes.byTier, fresh.fixes.byTier);
    this.metrics.fixes.total = 0;
    this.metrics.fixes.successful = 0;
    this.metrics.fixes.failed = 0;
    this.metrics.retries.total = 0;
    this.metrics.retries.escalations = 0;
    this.metrics.sanitization.totalRedactions = 0;
    this.metrics.sanitization.byType = {};
    this.metrics.cost.total = 0;
    Object.assign(this.metrics.cost.byTier, fresh.cost.byTier);
  }

  exportJSON(): string {
    return JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        ...this.getSnapshot(),
        successRate: this.getSuccessRate()
      },
      null,
      2
    );
  }
}

export const metrics = new MetricsCollector();
