import fs from 'node:fs/promises';
import path from 'node:path';
import type { ErrorFingerprint } from './fingerprinter.js';

export interface PatternEntry {
  id: string;
  fingerprintId: string;
  errorType: string;
  filePath: string;
  patch: string;
  description?: string;
  confidence?: number;
  successRate?: number;
  uses?: number;
}

export interface PatternLibrary {
  version: number;
  patterns: PatternEntry[];
  metadata?: Record<string, unknown> & {
    lastUpdated?: string;
    totalPatterns?: number;
  };
}

export interface PatternMatchResult {
  pattern: PatternEntry;
  strategy: 'exact' | 'fuzzy';
  confidence: number;
}

export interface PatternMatcherOptions {
  threshold?: number;
}

const DEFAULT_LIBRARY_PATH = path.join('shared', 'patterns', 'library.json');
const DEFAULT_THRESHOLD = 0.8;

export class PatternMatcher {
  private readonly library: PatternLibrary;
  private readonly threshold: number;

  private constructor(library: PatternLibrary, options: PatternMatcherOptions = {}) {
    this.library = library;
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
  }

  static async fromFile(
    filePath?: string,
    options: PatternMatcherOptions = {}
  ): Promise<PatternMatcher> {
    const basePath = filePath ?? process.env.HOMEOSTAT_PATTERN_LIBRARY_PATH ?? DEFAULT_LIBRARY_PATH;
    const resolved = path.resolve(basePath);
    try {
      const raw = await fs.readFile(resolved, 'utf8');
      const parsed: PatternLibrary = JSON.parse(raw);
      return new PatternMatcher(parsed, options);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }

      const empty: PatternLibrary = { version: 1, patterns: [] };
      return new PatternMatcher(empty, options);
    }
  }

  match(fingerprint: ErrorFingerprint): PatternMatchResult | null {
    if (!this.library.patterns.length) {
      return null;
    }

    const exact = this.findExactMatch(fingerprint);
    if (exact) {
      return exact;
    }

    const fuzzy = this.findFuzzyMatch(fingerprint);
    return fuzzy ?? null;
  }

  private findExactMatch(fingerprint: ErrorFingerprint): PatternMatchResult | undefined {
    const candidate = this.library.patterns.find((pattern) => pattern.fingerprintId === fingerprint.id);
    if (!candidate) {
      return undefined;
    }

    const confidence = this.resolveConfidence(candidate);
    if (confidence < this.threshold) {
      return undefined;
    }

    return { pattern: candidate, strategy: 'exact', confidence };
  }

  private findFuzzyMatch(fingerprint: ErrorFingerprint): PatternMatchResult | undefined {
    const candidates = this.library.patterns
      .filter(
        (pattern) =>
          pattern.errorType === fingerprint.errorType && pattern.filePath === fingerprint.filePath
      )
      .map((pattern) => ({ pattern, confidence: this.resolveConfidence(pattern) * 0.9 }))
      .filter(({ confidence }) => confidence >= this.threshold)
      .sort((a, b) => b.confidence - a.confidence);

    const best = candidates[0];
    if (!best) {
      return undefined;
    }

    return { pattern: best.pattern, strategy: 'fuzzy', confidence: best.confidence };
  }

  private resolveConfidence(pattern: PatternEntry): number {
    const successRate = pattern.successRate ?? 0;
    const explicit = pattern.confidence ?? 0;
    const uses = pattern.uses ?? 0;

    if (!explicit && !successRate) {
      return 0;
    }

    const weighted = explicit ? explicit : successRate;
    if (!uses) {
      return weighted;
    }

    const adjustment = Math.min(0.05 * uses, 0.2);
    return Math.min(1, weighted + adjustment);
  }
}
