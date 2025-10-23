import { performance } from 'perf_hooks';

type Tier = 1 | 2 | 3;

type SyntheticIssue = {
  id: number;
  title: string;
  stackLines: number;
  files: number;
};

type TokenCounts = {
  input: number;
  output: number;
};

export interface BenchmarkResult {
  totalIssues: number;
  medianLatency: number;
  p95Latency: number;
  tokenUsage: {
    tier1DeepSeek: number;
    tier2DeepSeek: number;
    tier2GPT5: number;
    tier3GPT5: number;
    total: number;
  };
  cost: {
    tier1: number;
    tier2: number;
    tier3: number;
    total: number;
  };
  meetsTarget: boolean;
}

// Mock-first benchmark harness: we simulate AI responses and latency so the
// benchmark can run quickly in CI without external dependencies.
export async function runBenchmark(): Promise<BenchmarkResult> {
  console.log('🚀 Starting benchmark with 100 issues...');

  const issues = generateSyntheticIssues(100);
  const latencies: number[] = [];

  const result: BenchmarkResult = {
    totalIssues: issues.length,
    medianLatency: 0,
    p95Latency: 0,
    tokenUsage: {
      tier1DeepSeek: 0,
      tier2DeepSeek: 0,
      tier2GPT5: 0,
      tier3GPT5: 0,
      total: 0
    },
    cost: { tier1: 0, tier2: 0, tier3: 0, total: 0 },
    meetsTarget: false
  };

  for (const issue of issues) {
    const startTime = performance.now();

    const { tier, tokens } = await mockProcessIssue(issue);

    if (tier === 1) {
      result.tokenUsage.tier1DeepSeek += tokens.input + tokens.output;
      result.cost.tier1 += calculateCost('deepseek', tokens);
    } else if (tier === 2) {
      result.tokenUsage.tier2DeepSeek += tokens.input;
      result.tokenUsage.tier2GPT5 += tokens.output / 2;
      result.cost.tier2 +=
        calculateCost('deepseek', { input: tokens.input, output: tokens.output / 2 }) +
        calculateCost('gpt5', { input: 0, output: tokens.output / 2 });
    } else {
      result.tokenUsage.tier3GPT5 += tokens.input + tokens.output;
      result.cost.tier3 += calculateCost('gpt5', tokens);
    }

    latencies.push(performance.now() - startTime);
  }

  latencies.sort((a, b) => a - b);
  result.medianLatency = percentile(latencies, 0.5);
  result.p95Latency = percentile(latencies, 0.95);

  result.tokenUsage.total =
    result.tokenUsage.tier1DeepSeek +
    result.tokenUsage.tier2DeepSeek +
    result.tokenUsage.tier2GPT5 +
    result.tokenUsage.tier3GPT5;

  result.cost.total = result.cost.tier1 + result.cost.tier2 + result.cost.tier3;

  const projectedCost = result.cost.total * 10; // 100 issues × 10 = 1,000 fixes
  result.meetsTarget = projectedCost <= 9.28;

  console.log(`✅ Benchmark complete!`);
  console.log(`📊 Median latency: ${result.medianLatency.toFixed(0)}ms`);
  console.log(`📊 p95 latency: ${result.p95Latency.toFixed(0)}ms`);
  console.log(`💰 Total cost (100 issues): $${result.cost.total.toFixed(4)}`);
  console.log(`💰 Projected annual cost (1,000 issues): $${projectedCost.toFixed(2)}`);
  console.log(`${result.meetsTarget ? '✅' : '❌'} Target: $9.28/year`);

  return result;
}

function generateSyntheticIssues(count: number): SyntheticIssue[] {
  const issues: SyntheticIssue[] = [];

  for (let i = 0; i < count; i += 1) {
    const rand = Math.random();
    let complexity: 'simple' | 'medium' | 'complex';

    if (rand < 0.7) {
      complexity = 'simple';
    } else if (rand < 0.95) {
      complexity = 'medium';
    } else {
      complexity = 'complex';
    }

    issues.push({
      id: i + 1,
      title: `[NoteBridge] Error #${i + 1}`,
      stackLines: complexity === 'simple' ? 3 : complexity === 'medium' ? 8 : 20,
      files: complexity === 'simple' ? 1 : complexity === 'medium' ? 2 : 5
    });
  }

  return issues;
}

async function mockProcessIssue(issue: SyntheticIssue): Promise<{ tier: Tier; tokens: TokenCounts }> {
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));

  let tier: Tier = 1;
  if (issue.stackLines > 5) tier = 2;
  if (issue.stackLines > 15) tier = 3;

  const tokenLookup: Record<Tier, TokenCounts> = {
    1: { input: 800, output: 400 },
    2: { input: 2000, output: 800 },
    3: { input: 4000, output: 1500 }
  };

  return { tier, tokens: tokenLookup[tier] };
}

function calculateCost(model: 'deepseek' | 'gpt5', tokens: TokenCounts): number {
  const pricing = {
    deepseek: { input: 0.00027 / 1000, output: 0.0011 / 1000 },
    gpt5: { input: 0.01 / 1000, output: 0.03 / 1000 }
  } as const;

  return tokens.input * pricing[model].input + tokens.output * pricing[model].output;
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.floor(values.length * fraction));
  return values[index];
}
