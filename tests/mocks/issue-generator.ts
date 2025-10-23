import { readFileSync } from 'fs';
import path from 'path';

export interface IssueOptions {
  extension?: string;
  errorType?: string;
  message?: string;
  stackFrames?: string[];
  breadcrumbs?: string[];
  fingerprint?: string;
  labels?: string[];
}

export function createIssue(options: IssueOptions = {}) {
  const extension = options.extension ?? 'NoteBridge';
  const errorType = options.errorType ?? 'TypeError';
  const message = options.message ?? 'Default message';
  const body = [
    '## Error Details',
    `- Extension: ${extension} v1.0.0`,
    `- Message: ${message}`,
    `- Fingerprint: ${options.fingerprint ?? 'auto-generated'}`,
    '',
    '## Stack Trace',
    '```',
    ...(options.stackFrames?.length
      ? options.stackFrames
      : [`${errorType}: ${message}`, '    at background/index.js:10:2']),
    '```',
    '',
    '## Breadcrumbs',
    ...(options.breadcrumbs ?? ['1. Default breadcrumb'])
  ].join('\n');

  return {
    number: Math.floor(Math.random() * 1000),
    title: `[${extension}] ${errorType}: ${message}`,
    body,
    labels: (options.labels ?? ['robot']).map((name) => ({ name }))
  };
}

export function loadPIICorpus() {
  const filePath = path.join(process.cwd(), 'tests/fixtures/logger/pii-corpus.txt');
  return readFileSync(filePath, 'utf-8');
}
