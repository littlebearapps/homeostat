import fs from 'node:fs/promises';
import path from 'node:path';
import type { PatternLibrary } from './matcher.js';

export interface LearningEvent {
  patternId: string;
  success: boolean;
}

export interface PatternLearnerOptions {
  libraryPath?: string;
  env?: string;
  alpha?: number;
}

const DEFAULT_LIBRARY_PATH = path.join('shared', 'patterns', 'library.json');
const DEFAULT_ALPHA = 0.1;

export class PatternLearner {
  private readonly libraryPath: string;
  private readonly env: string;
  private readonly alpha: number;

  constructor(options: PatternLearnerOptions = {}) {
    this.libraryPath = options.libraryPath
      ? path.resolve(options.libraryPath)
      : path.resolve(DEFAULT_LIBRARY_PATH);
    this.env = options.env ?? process.env.HOMEOSTAT_ENV ?? 'dev';
    this.alpha = options.alpha ?? DEFAULT_ALPHA;
  }

  async learn(event: LearningEvent): Promise<void> {
    if (this.env !== 'production') {
      return;
    }

    const library = await this.readLibrary();
    const pattern = library.patterns.find((entry) => entry.id === event.patternId);

    if (!pattern) {
      return;
    }

    const previousSuccess = pattern.successRate ?? 0.5;
    const previousUses = pattern.uses ?? 0;
    const outcomeValue = event.success ? 1 : 0;

    const updatedSuccess = previousUses
      ? (1 - this.alpha) * previousSuccess + this.alpha * outcomeValue
      : outcomeValue || previousSuccess;

    pattern.successRate = Number(updatedSuccess.toFixed(4));
    pattern.uses = previousUses + 1;

    if ((pattern.uses ?? 0) >= 10 && (pattern.successRate ?? 0) < 0.5) {
      library.patterns = library.patterns.filter((entry) => entry.id !== pattern.id);
    }

    library.metadata = {
      ...(library.metadata ?? {}),
      lastUpdated: new Date().toISOString(),
      totalPatterns: library.patterns.length
    };

    await this.writeLibrary(library);
  }

  private async readLibrary(): Promise<PatternLibrary> {
    try {
      const raw = await fs.readFile(this.libraryPath, 'utf8');
      return JSON.parse(raw) as PatternLibrary;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      const empty: PatternLibrary = { version: 1, patterns: [], metadata: {} };
      await this.writeLibrary(empty);
      return empty;
    }
  }

  private async writeLibrary(library: PatternLibrary): Promise<void> {
    await fs.mkdir(path.dirname(this.libraryPath), { recursive: true });
    await fs.writeFile(this.libraryPath, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
  }
}
