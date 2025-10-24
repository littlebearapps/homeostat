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
  private readonly state: Metrics;

  constructor(initialMetrics: Metrics = createEmptyMetrics()) {
    this.state = initialMetrics;
  }

  recordFix(tier: number, success: boolean, cost: number) {
    const tierKey = `tier${tier}` as const;

    this.state.fixes.total += 1;
    if (tierKey in this.state.fixes.byTier) {
      this.state.fixes.byTier[tierKey] += 1;
    }

    if (success) {
      this.state.fixes.successful += 1;
    } else {
      this.state.fixes.failed += 1;
    }

    this.state.cost.total += cost;
    if (tierKey in this.state.cost.byTier) {
      this.state.cost.byTier[tierKey] += cost;
    }
  }

  recordRetry(escalated = false) {
    this.state.retries.total += 1;
    if (escalated) {
      this.state.retries.escalations += 1;
    }
  }

  recordRedaction(type: string) {
    this.state.sanitization.totalRedactions += 1;
    this.state.sanitization.byType[type] =
      (this.state.sanitization.byType[type] ?? 0) + 1;
  }

  getSuccessRate(): number {
    if (this.state.fixes.total === 0) {
      return 0;
    }
    return this.state.fixes.successful / this.state.fixes.total;
  }

  getSnapshot(): Metrics {
    return JSON.parse(JSON.stringify(this.state)) as Metrics;
  }

  get metrics(): Metrics {
    return this.getSnapshot();
  }

  reset() {
    const fresh = createEmptyMetrics();
    Object.assign(this.state.fixes.byTier, fresh.fixes.byTier);
    this.state.fixes.total = 0;
    this.state.fixes.successful = 0;
    this.state.fixes.failed = 0;
    this.state.retries.total = 0;
    this.state.retries.escalations = 0;
    this.state.sanitization.totalRedactions = 0;
    this.state.sanitization.byType = {};
    this.state.cost.total = 0;
    Object.assign(this.state.cost.byTier, fresh.cost.byTier);
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
