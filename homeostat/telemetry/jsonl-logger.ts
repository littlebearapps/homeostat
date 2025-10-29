import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface RunMetrics {
  timestamp: string;
  repo: string;
  fingerprintsProcessed: string[];
  prsCreated: number;
  prsUpdated: number;
  cooldowns: number;
  cost: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
  latency: number;
  errors: string[];
  patternsUsed: number;
  zeroCostFixes: number;
}

interface AggregateMetrics {
  totalCost: number;
  totalTokens: number;
  totalPRs: number;
  avgLatency: number;
  errorRate: number;
}

export class JSONLLogger {
  private static ARTIFACTS_DIR = 'artifacts';

  private static resolveArtifactsDir(): string {
    const override = process.env.HOMEOSTAT_ARTIFACTS_PATH;
    return override ? resolve(override) : resolve(this.ARTIFACTS_DIR);
  }

  static logRunMetrics(metrics: RunMetrics): void {
    const artifactsDir = this.resolveArtifactsDir();
    mkdirSync(artifactsDir, { recursive: true });

    const filename = `run-${Date.now()}.jsonl`;
    const filepath = join(artifactsDir, filename);

    const line = JSON.stringify(metrics) + '\n';

    // Retry once on ENOENT (parallel tests may delete directory between mkdir and append)
    try {
      appendFileSync(filepath, line, { encoding: 'utf8' });
    } catch (error: any) {
      if (error.code === 'ENOENT' || error.code === 'EINVAL') {
        // Directory was deleted by another test - recreate and retry once
        mkdirSync(artifactsDir, { recursive: true });
        appendFileSync(filepath, line, { encoding: 'utf8' });
      } else {
        throw error;
      }
    }
  }

  static async aggregateMetrics(since: Date): Promise<AggregateMetrics> {
    const artifactsDir = this.resolveArtifactsDir();
    mkdirSync(artifactsDir, { recursive: true });

    const files = readdirSync(artifactsDir).filter((file) => file.endsWith('.jsonl'));
    if (!files.length) {
      return { totalCost: 0, totalTokens: 0, totalPRs: 0, avgLatency: 0, errorRate: 0 };
    }

    let totalCost = 0;
    let totalTokens = 0;
    let totalPRs = 0;
    let totalLatency = 0;
    let totalEntries = 0;
    let erroredEntries = 0;

    for (const file of files) {
      const filePath = join(artifactsDir, file);
      if (!existsSync(filePath)) {
        continue;
      }

      const contents = readFileSync(filePath, 'utf8');
      const lines = contents.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as RunMetrics;
          if (new Date(parsed.timestamp).getTime() < since.getTime()) {
            continue;
          }

          totalCost += parsed.cost;
          totalTokens +=
            (parsed.tokens?.input ?? 0) +
            (parsed.tokens?.output ?? 0) +
            (parsed.tokens?.cacheRead ?? 0) +
            (parsed.tokens?.cacheWrite ?? 0);
          totalPRs += (parsed.prsCreated ?? 0) + (parsed.prsUpdated ?? 0);
          totalLatency += parsed.latency ?? 0;
          totalEntries += 1;
          if (parsed.errors?.length) {
            erroredEntries += 1;
          }
        } catch (error) {
          // Skip malformed lines but continue processing
          erroredEntries += 1;
        }
      }
    }

    if (!totalEntries) {
      return { totalCost: 0, totalTokens: 0, totalPRs: 0, avgLatency: 0, errorRate: 0 };
    }

    return {
      totalCost,
      totalTokens,
      totalPRs,
      avgLatency: totalLatency / totalEntries,
      errorRate: erroredEntries / totalEntries
    };
  }
}

export default JSONLLogger;
