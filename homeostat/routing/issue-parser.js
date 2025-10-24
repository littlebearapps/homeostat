import { sanitizeStackTrace } from '../../shared/privacy/sanitizer.js';

function asString(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

export function parseIssueTitle(title = '') {
  const normalized = asString(title).trim();
  const extensionMatch = normalized.match(/\[([^\]]+)\]/);
  const errorMatch = normalized.match(/\]\s*([^:]+):\s*(.+)$/);
  const extension = extensionMatch ? extensionMatch[1].trim() : '';
  const errorType = errorMatch ? errorMatch[1].trim() : '';
  const errorMessage = errorMatch ? errorMatch[2].trim() : '';
  const errors = [];
  if (!extension || !errorType || !errorMessage) {
    errors.push('Invalid issue title format');
  }
  return { extension, errorType, errorMessage, errors };
}

export function extractSection(body = '', sectionHeader = '') {
  const normalized = asString(body);
  const regex = new RegExp(`${sectionHeader}\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = normalized.match(regex);
  return match ? match[1].trim() : '';
}

export function parseField(section = '', fieldName = '') {
  const normalized = asString(section);
  const regex = new RegExp(`^-\\s*${fieldName}:\\s*(.+)$`, 'mi');
  const match = normalized.match(regex);
  return match ? match[1].trim() : '';
}

export function extractCodeBlock(section = '') {
  const normalized = asString(section);
  const codeMatch = normalized.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
  return codeMatch ? codeMatch[1].trim() : normalized.trim();
}

export function parseBreadcrumbs(section = '') {
  const normalized = asString(section);
  if (!normalized) return [];
  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\d+\.\s*(.+)$/);
      return match ? match[1].trim() : line;
    });
}

function normalizeLabels(labels = []) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);
}

export function parseLoggerIssue(issue = {}) {
  const safeIssue = typeof issue === 'object' && issue !== null ? issue : {};
  const errors = [];
  const titleData = parseIssueTitle(safeIssue.title);
  errors.push(...titleData.errors);

  const body = asString(safeIssue.body);
  const bodySize = Buffer.byteLength(body, 'utf8');
  if (bodySize > 100 * 1024) {
    errors.push('Issue body exceeds 100KB limit');
  }
  const errorDetailsSection = extractSection(body, '## Error Details');
  const stackSection = extractSection(body, '## Stack Trace');
  const breadcrumbsSection = extractSection(body, '## Breadcrumbs');

  const message = parseField(errorDetailsSection, 'Message');
  const fingerprint = parseField(errorDetailsSection, 'Fingerprint');
  const extensionLine = parseField(errorDetailsSection, 'Extension');
  const [extensionName, version] = extensionLine.split(/\sv/);

  const rawStack = extractCodeBlock(stackSection);
  const sanitizedStack = sanitizeStackTrace(rawStack);
  const breadcrumbs = parseBreadcrumbs(breadcrumbsSection);

  if (!sanitizedStack) {
    errors.push('Missing required field: stackTrace');
  }
  if (!fingerprint) {
    errors.push('Missing required field: fingerprint');
  }
  if (!breadcrumbs.length) {
    errors.push('Missing required field: breadcrumbs');
  }

  const parsed = {
    extension: extensionName?.trim() || titleData.extension || '',
    version: version?.trim() || null,
    errorType: titleData.errorType || '',
    errorMessage: titleData.errorMessage || message || '',
    message: message || titleData.errorMessage || '',
    timestamp: parseField(errorDetailsSection, 'Timestamp') || null,
    fingerprint,
    stackTrace: sanitizedStack,
    breadcrumbs,
    issueNumber: safeIssue.number ?? null,
    issueUrl: safeIssue.html_url ?? '',
    labels: normalizeLabels(safeIssue.labels)
  };

  return { parsed, errors };
}

export default parseLoggerIssue;
