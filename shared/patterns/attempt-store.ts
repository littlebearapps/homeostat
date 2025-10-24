import fs from 'node:fs/promises';
import path from 'node:path';

export interface AttemptHistoryEntry {
  timestamp: string;
  success: boolean;
}

export interface AttemptState {
  fingerprint: string;
  attempts: number;
  cooldownUntil?: string;
  lastAttempt?: string;
  exhausted?: boolean;
  history: AttemptHistoryEntry[];
}

export interface AttemptStoreOptions {
  storageDir?: string;
  fileName?: string;
  now?: () => Date;
}

const DEFAULT_FILE = 'attempt-store.json';
export const MAX_ATTEMPTS = 3;
const BASE_COOLDOWN_HOURS = 24;

export class AttemptStore {
  private readonly storagePath: string;
  private readonly now: () => Date;
  private state: Map<string, AttemptState> = new Map();
  private loaded = false;

  constructor(options: AttemptStoreOptions = {}) {
    const envPath = process.env.HOMEOSTAT_ATTEMPT_STORE_PATH;
    if (envPath) {
      this.storagePath = path.resolve(envPath);
    } else {
      const storageDir = options.storageDir ?? path.join(process.cwd(), '.homeostat');
      this.storagePath = path.join(storageDir, options.fileName ?? DEFAULT_FILE);
    }
    this.now = options.now ?? (() => new Date());
  }

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    try {
      const data = await fs.readFile(this.storagePath, 'utf8');
      const parsed: AttemptState[] = JSON.parse(data);
      this.state = new Map(parsed.map((entry) => [entry.fingerprint, entry]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      await fs.writeFile(this.storagePath, '[]', 'utf8');
      this.state = new Map();
    }

    this.loaded = true;
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    const serialized = JSON.stringify(Array.from(this.state.values()), null, 2);
    await fs.writeFile(this.storagePath, `${serialized}\n`, 'utf8');
  }

  async getState(fingerprint: string): Promise<AttemptState> {
    await this.load();
    if (!this.state.has(fingerprint)) {
      const empty: AttemptState = {
        fingerprint,
        attempts: 0,
        history: []
      };
      this.state.set(fingerprint, empty);
    }

    return this.state.get(fingerprint)!;
  }

  async canAttempt(fingerprint: string): Promise<boolean> {
    const state = await this.getState(fingerprint);
    if (state.exhausted) {
      return false;
    }

    if (state.attempts >= MAX_ATTEMPTS) {
      state.exhausted = true;
      await this.save();
      return false;
    }

    if (!state.cooldownUntil) {
      return true;
    }

    return new Date(state.cooldownUntil).getTime() <= this.now().getTime();
  }

  async recordAttempt(fingerprint: string, success: boolean): Promise<AttemptState> {
    const state = await this.getState(fingerprint);
    const timestamp = this.now().toISOString();

    state.lastAttempt = timestamp;
    state.history.push({ timestamp, success });

    if (success) {
      state.attempts = 0;
      state.cooldownUntil = undefined;
      state.exhausted = false;
    } else {
      state.attempts += 1;
      const cooldownHours = this.calculateCooldownHours(state.attempts);
      const cooldownUntil = new Date(this.now().getTime() + cooldownHours * 60 * 60 * 1000);
      state.cooldownUntil = cooldownUntil.toISOString();
      state.exhausted = state.attempts >= MAX_ATTEMPTS;
    }

    this.state.set(fingerprint, state);
    await this.save();
    return state;
  }

  private calculateCooldownHours(attempts: number): number {
    const exponent = Math.max(0, attempts - 1);
    const hours = BASE_COOLDOWN_HOURS * 2 ** exponent;
    return Math.min(hours, BASE_COOLDOWN_HOURS * 2 ** (MAX_ATTEMPTS - 1));
  }
}
