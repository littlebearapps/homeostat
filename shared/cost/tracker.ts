export interface TokenUsage {
  model: 'deepseek' | 'gpt5';
  inputTokens: number;
  outputTokens: number;
  issueNumber: number;
  tier: number;
}

export class CostTracker {
  private usage: TokenUsage[] = [];

  private readonly PER_FIX_BUDGET = 0.01;

  private readonly PRICING = {
    deepseek: {
      input: 0.00027 / 1000,
      output: 0.0011 / 1000
    },
    gpt5: {
      input: 0.01 / 1000,
      output: 0.03 / 1000
    }
  } as const;

  trackUsage(usage: TokenUsage): void {
    const cost = this.calculateCost(usage);

    if (cost > this.PER_FIX_BUDGET) {
      throw new Error(`Fix exceeded budget: $${cost.toFixed(4)} > $${this.PER_FIX_BUDGET}`);
    }

    this.usage.push(usage);
  }

  private calculateCost(usage: TokenUsage): number {
    const pricing = this.PRICING[usage.model];
    return usage.inputTokens * pricing.input + usage.outputTokens * pricing.output;
  }

  getTotalCost(): number {
    return this.usage.reduce((sum, item) => sum + this.calculateCost(item), 0);
  }

  projectAnnualCost(fixesPerYear = 1000): number {
    if (!this.usage.length) {
      return 0;
    }

    const averageCost = this.getTotalCost() / this.usage.length;
    return averageCost * fixesPerYear;
  }

  exportMetrics() {
    const totalCost = this.getTotalCost();

    return {
      totalFixes: this.usage.length,
      totalCost,
      projectedAnnualCost: this.projectAnnualCost(),
      breakdown: {
        tier1: this.costForTier(1),
        tier2: this.costForTier(2),
        tier3: this.costForTier(3)
      },
      tierDistribution: {
        tier1: this.countForTier(1),
        tier2: this.countForTier(2),
        tier3: this.countForTier(3)
      }
    };
  }

  private costForTier(tier: number): number {
    return this.usage
      .filter((usage) => usage.tier === tier)
      .reduce((sum, item) => sum + this.calculateCost(item), 0);
  }

  private countForTier(tier: number): number {
    return this.usage.filter((usage) => usage.tier === tier).length;
  }
}
