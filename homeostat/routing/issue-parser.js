import { sanitizeStackTrace } from '../../shared/privacy/sanitizer.js';

function asString(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

/**
 * Detect source type from issue labels
 * @param {Array} labels - GitHub issue labels
 * @returns {'wordpress' | 'vps' | 'extension'} - Source type
 */
export function detectSource(labels = []) {
  const labelNames = normalizeLabels(labels).map((l) => l.toLowerCase());

  if (labelNames.includes('source:wordpress')) return 'wordpress';
  if (labelNames.includes('source:vps')) return 'vps';
  if (labelNames.includes('source:cloakpipe')) return 'extension';

  // Default: Extension (backward compatibility)
  return 'extension';
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

/**
 * Parse inline field from server issue body
 * Format: **FieldName:** value
 * @param {string} body - Issue body
 * @param {string} fieldName - Field to extract
 * @returns {string | null} - Field value or null
 */
export function parseInlineField(body = '', fieldName = '') {
  const normalized = asString(body);
  const regex = new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+?)(?=\\n|$)`, 'i');
  const match = normalized.match(regex);

  if (!match) return null;

  // Split on • and take first value (for multi-value fields)
  const values = match[1].trim().split('•');
  return values[0].trim();
}

/**
 * Generate synthetic breadcrumbs for server errors
 * Servers don't have user action trail like browser extensions
 * @param {Object} parsed - Parsed server issue data
 * @returns {Array<string>} - Synthetic breadcrumbs
 */
export function generateSyntheticBreadcrumbs(parsed = {}) {
  const breadcrumbs = [];

  // Add cron job context (VPS)
  if (parsed.job) {
    breadcrumbs.push(`Cron job started: ${parsed.job}`);
  }

  // Add location context
  if (parsed.location) {
    breadcrumbs.push(`Error in ${parsed.location}`);
  }

  // Add general context
  if (parsed.context) {
    const contextPreview = parsed.context.substring(0, 100);
    breadcrumbs.push(`Context: ${contextPreview}${parsed.context.length > 100 ? '...' : ''}`);
  }

  // Add error type
  if (parsed.errorType) {
    breadcrumbs.push(`Error thrown: ${parsed.errorType}`);
  }

  // Fallback if no contextual info
  if (breadcrumbs.length === 0) {
    breadcrumbs.push('Server-side error (no user action trail)');
  }

  return breadcrumbs;
}

function normalizeLabels(labels = []) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);
}

/**
 * Parse server issue (WordPress, VPS) with inline field format
 * Template: **Field:** value
 * @param {Object} issue - GitHub issue object
 * @returns {Object} - { parsed, errors }
 */
export function parseServerIssue(issue = {}) {
  const safeIssue = typeof issue === 'object' && issue !== null ? issue : {};
  const errors = [];
  const titleData = parseIssueTitle(safeIssue.title);
  errors.push(...titleData.errors);

  const body = asString(safeIssue.body);
  const bodySize = Buffer.byteLength(body, 'utf8');
  if (bodySize > 100 * 1024) {
    errors.push('Issue body exceeds 100KB limit');
  }

  // Extract sections first (CloakPipe format uses section headers)
  const errorDetailsSection = extractSection(body, '## Error Details');
  const messageSection = extractSection(body, '## Error Message');
  const stackSection = extractSection(body, '## Stack Trace');
  const contextSection = extractSection(body, '## Context');
  const phpEnvSection = extractSection(body, '## PHP Environment');

  // Parse fields from ## Error Details section using bullet list format (- Field: value)
  const product = parseField(errorDetailsSection, 'Product') || titleData.extension || '';
  const messageField = parseField(errorDetailsSection, 'Message'); // Primary error message source
  const occurrencesStr = parseField(errorDetailsSection, 'Occurrences') || '1';
  const occurrences = parseInt(occurrencesStr, 10) || 1; // Handle NaN
  const fingerprint = parseField(errorDetailsSection, 'Fingerprint');
  const timestamp = parseField(errorDetailsSection, 'Timestamp');
  const environment = parseField(errorDetailsSection, 'Environment');

  // Parse version from multiple possible fields
  const version = parseField(errorDetailsSection, 'Version') ||
                  parseField(errorDetailsSection, 'Plugin Version') ||
                  parseField(errorDetailsSection, 'Tool Version');

  // Parse PHP Environment section (for WordPress)
  const location = parseField(phpEnvSection, 'File') || parseField(errorDetailsSection, 'Location');

  // Parse VPS-specific fields from Error Details
  const job = parseField(errorDetailsSection, 'Job'); // VPS cron job name

  const rawStack = extractCodeBlock(stackSection);
  const sanitizedStack = sanitizeStackTrace(rawStack);

  // Validation (servers don't require breadcrumbs)
  if (!sanitizedStack) {
    errors.push('Missing required field: stackTrace');
  }
  if (!fingerprint) {
    errors.push('Missing required field: fingerprint');
  }

  const parsed = {
    extension: product,
    product,
    version,
    errorType: titleData.errorType || '',
    errorMessage: messageField || titleData.errorMessage || messageSection || '',
    message: messageField || messageSection || titleData.errorMessage || '',
    timestamp,
    fingerprint,
    stackTrace: sanitizedStack,
    occurrences,
    location,
    job,
    environment,
    context: contextSection,
    breadcrumbs: [], // Will be generated synthetically
    issueNumber: safeIssue.number ?? null,
    issueUrl: safeIssue.html_url ?? '',
    labels: normalizeLabels(safeIssue.labels),
    source: detectSource(safeIssue.labels) // Add source for tracking
  };

  // Generate synthetic breadcrumbs
  parsed.breadcrumbs = generateSyntheticBreadcrumbs(parsed);

  return { parsed, errors };
}

/**
 * Parse extension issue (Chrome, Firefox, Safari, Edge) with section format
 * Template: ## Section headers
 * @param {Object} issue - GitHub issue object
 * @returns {Object} - { parsed, errors }
 */
export function parseExtensionIssue(issue = {}) {
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
    labels: normalizeLabels(safeIssue.labels),
    source: 'extension' // Add source for tracking
  };

  return { parsed, errors };
}

/**
 * Main entry point - route to appropriate parser based on source
 * @param {Object} issue - GitHub issue object
 * @returns {Object} - { parsed, errors }
 */
export function parseLoggerIssue(issue = {}) {
  const safeIssue = typeof issue === 'object' && issue !== null ? issue : {};
  const source = detectSource(safeIssue.labels);

  // Route to appropriate parser based on source
  if (source === 'wordpress' || source === 'vps') {
    return parseServerIssue(issue);
  } else {
    return parseExtensionIssue(issue);
  }
}

export default parseLoggerIssue;
