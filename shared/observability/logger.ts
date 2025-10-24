import { v4 as uuidv4 } from 'uuid';
import { sanitizeCode } from '../privacy/sanitizer.js';

export interface LogContext {
  runId: string;
  issueNumber?: number;
  tier?: number;
  stage?: string;
  [key: string]: unknown;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogData = Record<string, unknown> | undefined;

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return sanitizeCode(value);
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, seen));
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) {
      return '[REDACTED_CIRCULAR_REFERENCE]';
    }

    seen.add(obj);
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(obj)) {
      sanitized[key] = sanitizeValue(entry, seen);
    }
    seen.delete(obj);
    return sanitized;
  }

  return value;
}

function sanitizeData(data: LogData): LogData {
  if (!data) {
    return data;
  }

  const seen = new WeakSet<object>();
  return sanitizeValue(data, seen) as Record<string, unknown>;
}

export class StructuredLogger {
  private context: LogContext;

  constructor(context: Partial<LogContext> = {}) {
    this.context = {
      runId: context.runId ?? uuidv4(),
      ...context
    } as LogContext;
  }

  private log(level: LogLevel, message: string, data?: LogData) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizeCode(message),
      ...this.context,
      ...sanitizeData(data)
    };

    // eslint-disable-next-line no-console -- Structured logging stream per IMPLEMENTATION-ROADMAP.md observability guidance.
    console.log(JSON.stringify(payload));
  }

  debug(message: string, data?: LogData) {
    this.log('debug', message, data);
  }

  info(message: string, data?: LogData) {
    this.log('info', message, data);
  }

  warn(message: string, data?: LogData) {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error, data?: LogData) {
    const errorPayload = error
      ? {
          error: {
            name: sanitizeCode(error.name ?? 'Error'),
            message: sanitizeCode(error.message ?? ''),
            stack: error.stack ? sanitizeCode(error.stack) : undefined
          }
        }
      : undefined;

    this.log('error', message, {
      ...errorPayload,
      ...data
    });
  }

  setContext(context: Partial<LogContext>) {
    this.context = {
      ...this.context,
      ...context
    };
  }

  child(context: Partial<LogContext>): StructuredLogger {
    return new StructuredLogger({
      ...this.context,
      ...context,
      runId: this.context.runId
    });
  }
}

export const logger = new StructuredLogger();
