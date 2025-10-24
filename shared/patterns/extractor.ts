import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ErrorFingerprint } from './fingerprinter.js';
import type { PatternEntry, PatternLibrary } from './matcher.js';

export interface ExtractPatternInput {
  fingerprint: ErrorFingerprint;
  patch: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface PatternExtractorOptions {
  libraryPath?: string;
  env?: string;
}

const DEFAULT_LIBRARY_PATH = path.join('shared', 'patterns', 'library.json');

export class PatternExtractor {
  private readonly libraryPath: string;
  private readonly env: string;

  constructor(options: PatternExtractorOptions = {}) {
    const envPath = process.env.HOMEOSTAT_PATTERN_LIBRARY_PATH;
    this.libraryPath = options.libraryPath
      ? path.resolve(options.libraryPath)
      : envPath
      ? path.resolve(envPath)
      : path.resolve(DEFAULT_LIBRARY_PATH);
    this.env = options.env ?? process.env.HOMEOSTAT_ENV ?? 'dev';
  }

  async extract(input: ExtractPatternInput): Promise<PatternEntry | null> {
    if (this.env !== 'production') {
      return null;
    }

    const library = await this.readLibrary();
    const existing = library.patterns.find(
      (pattern) => pattern.fingerprintId === input.fingerprint.id
    );

    if (existing) {
      return existing;
    }

    const pattern: PatternEntry = {
      id: crypto.randomUUID(),
      fingerprintId: input.fingerprint.id,
      errorType: input.fingerprint.errorType,
      filePath: input.fingerprint.filePath,
      patch: input.patch,
      description: input.description,
      confidence: 0.9,
      successRate: 1,
      uses: 0
    };

    library.patterns.push(pattern);
    library.metadata = {
      ...(library.metadata ?? {}),
      lastUpdated: new Date().toISOString(),
      totalPatterns: library.patterns.length,
      ...input.metadata
    };

    await this.writeLibrary(library);
    return pattern;
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
