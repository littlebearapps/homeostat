/**
 * Multi-Platform Issue Parsing Integration Tests
 *
 * Tests source detection, dual parser routing, and parsing for:
 * - WordPress plugin errors (inline format)
 * - VPS tool errors (inline format)
 * - Browser extension errors (section format)
 */

import { describe, it, expect } from 'vitest';
import {
  detectSource,
  parseServerIssue,
  parseExtensionIssue,
  parseLoggerIssue,
  parseInlineField,
  generateSyntheticBreadcrumbs
} from '../../homeostat/routing/issue-parser.js';

describe('Source Detection', () => {
  it('detects WordPress source from labels', () => {
    const labels = [{ name: 'robot' }, { name: 'source:wordpress' }];
    expect(detectSource(labels)).toBe('wordpress');
  });

  it('detects VPS source from labels', () => {
    const labels = [{ name: 'robot' }, { name: 'source:vps' }];
    expect(detectSource(labels)).toBe('vps');
  });

  it('detects extension source from source:cloakpipe label', () => {
    const labels = [{ name: 'robot' }, { name: 'source:cloakpipe' }];
    expect(detectSource(labels)).toBe('extension');
  });

  it('defaults to extension for backward compatibility', () => {
    const labels = [{ name: 'robot' }];
    expect(detectSource(labels)).toBe('extension');
  });

  it('handles empty labels array', () => {
    expect(detectSource([])).toBe('extension');
  });

  it('handles label objects with name property', () => {
    const labels = [
      { name: 'robot', color: 'red' },
      { name: 'source:wordpress', color: 'blue' }
    ];
    expect(detectSource(labels)).toBe('wordpress');
  });
});

describe('Inline Field Parsing', () => {
  it('parses simple inline field', () => {
    const body = '**Error Type:** PDOException\n**Occurrences:** 3';
    expect(parseInlineField(body, 'Error Type')).toBe('PDOException');
  });

  it('parses multi-value inline field and returns first value', () => {
    const body = '**Error Type:** PDOException • Database error\n';
    expect(parseInlineField(body, 'Error Type')).toBe('PDOException');
  });

  it('returns null for missing field', () => {
    const body = '**Error Type:** PDOException\n';
    expect(parseInlineField(body, 'Missing Field')).toBeNull();
  });

  it('handles case-insensitive field names', () => {
    const body = '**error type:** PDOException\n';
    expect(parseInlineField(body, 'Error Type')).toBe('PDOException');
  });

  it('trims whitespace from field value', () => {
    const body = '**Error Type:**   PDOException   \n';
    expect(parseInlineField(body, 'Error Type')).toBe('PDOException');
  });
});

describe('Synthetic Breadcrumb Generation', () => {
  it('generates breadcrumbs from cron job context', () => {
    const parsed = {
      job: 'daily-report',
      errorType: 'UnhandledRejection'
    };
    const breadcrumbs = generateSyntheticBreadcrumbs(parsed);

    expect(breadcrumbs).toContain('Cron job started: daily-report');
    expect(breadcrumbs).toContain('Error thrown: UnhandledRejection');
  });

  it('generates breadcrumbs from location context', () => {
    const parsed = {
      location: 'api/fetch-brands.js:78',
      errorType: 'NetworkError'
    };
    const breadcrumbs = generateSyntheticBreadcrumbs(parsed);

    expect(breadcrumbs).toContain('Error in api/fetch-brands.js:78');
    expect(breadcrumbs).toContain('Error thrown: NetworkError');
  });

  it('generates breadcrumbs from general context', () => {
    const parsed = {
      context: 'Daily brand sync operation failed during data fetch',
      errorType: 'DatabaseError'
    };
    const breadcrumbs = generateSyntheticBreadcrumbs(parsed);

    expect(breadcrumbs.some(b => b.startsWith('Context:'))).toBe(true);
    expect(breadcrumbs).toContain('Error thrown: DatabaseError');
  });

  it('truncates long context to 100 characters', () => {
    const parsed = {
      context: 'A'.repeat(150),
      errorType: 'Error'
    };
    const breadcrumbs = generateSyntheticBreadcrumbs(parsed);
    const contextBreadcrumb = breadcrumbs.find(b => b.startsWith('Context:'));

    expect(contextBreadcrumb).toBeDefined();
    expect(contextBreadcrumb!.length).toBeLessThan(120); // Context: + 100 chars + ...
  });

  it('provides fallback breadcrumb when no context available', () => {
    const parsed = {};
    const breadcrumbs = generateSyntheticBreadcrumbs(parsed);

    expect(breadcrumbs).toEqual(['Server-side error (no user action trail)']);
  });

  it('combines multiple context sources', () => {
    const parsed = {
      job: 'weekly-audit',
      location: 'auditor/scan.py:234',
      context: 'Scanning WordPress installation',
      errorType: 'PermissionError'
    };
    const breadcrumbs = generateSyntheticBreadcrumbs(parsed);

    expect(breadcrumbs.length).toBeGreaterThan(1);
    expect(breadcrumbs).toContain('Cron job started: weekly-audit');
    expect(breadcrumbs).toContain('Error in auditor/scan.py:234');
    expect(breadcrumbs).toContain('Error thrown: PermissionError');
  });
});

describe('WordPress Issue Parsing', () => {
  it('parses WordPress issue with inline format', () => {
    const issue = {
      title: '[claudecode-wordpress-mcp] PDOException: Database connection failed',
      labels: [{ name: 'robot' }, { name: 'source:wordpress' }],
      number: 123,
      html_url: 'https://github.com/test/repo/issues/123',
      body: `**Error Type:** PDOException
**Occurrences:** 3
**Site Hash:** abc123def456
**PHP Version:** 8.1.0
**WordPress Version:** 6.4.0
**Plugin Version:** 1.0.0
**Timestamp:** 2025-10-29T12:34:56Z
**Environment:** production
**Fingerprint:** db-conn-fail-wp-123

## Error Message
Database connection failed: SQLSTATE[HY000] [2002] Connection refused

## Stack Trace
\`\`\`
PDOException: SQLSTATE[HY000] [2002] Connection refused
  at includes/database.php:45
  at includes/backup.php:120
\`\`\`

## Context
User initiated backup operation`
    };

    const result = parseServerIssue(issue);

    expect(result.errors).toHaveLength(0);
    expect(result.parsed.product).toBe('claudecode-wordpress-mcp');
    expect(result.parsed.errorType).toBe('PDOException');
    expect(result.parsed.errorMessage).toBe('Database connection failed');
    expect(result.parsed.occurrences).toBe(3);
    expect(result.parsed.fingerprint).toBe('db-conn-fail-wp-123');
    expect(result.parsed.version).toBe('1.0.0');
    expect(result.parsed.environment).toBe('production');
    expect(result.parsed.stackTrace).toContain('includes/database.php:45');
    expect(result.parsed.breadcrumbs.length).toBeGreaterThan(0);
    expect(result.parsed.source).toBe('wordpress');
  });
});

describe('VPS Issue Parsing', () => {
  it('parses VPS issue with inline format', () => {
    const issue = {
      title: '[brand-copilot] UnhandledRejection: ECONNREFUSED',
      labels: [{ name: 'robot' }, { name: 'source:vps' }],
      number: 456,
      html_url: 'https://github.com/test/repo/issues/456',
      body: `**Error Type:** UnhandledRejection
**Occurrences:** 1
**Host:** vps-little-bear-apps-1
**Job:** daily-report
**Runtime:** Node.js v20.10.0
**Tool Version:** 1.0.0
**Timestamp:** 2025-10-29T03:00:00Z
**Environment:** production
**Fingerprint:** fetch-timeout-bc-456
**Location:** api/fetch-brands.js:78

## Error Message
ECONNREFUSED: Connection refused at 127.0.0.1:3306

## Stack Trace
\`\`\`
NetworkError: Request timeout after 30s
  at api/fetch-brands.js:78
  at cron/daily-sync.js:34
\`\`\`

## Context
Daily cron job (3am) - last successful run 24h ago`
    };

    const result = parseServerIssue(issue);

    expect(result.errors).toHaveLength(0);
    expect(result.parsed.product).toBe('brand-copilot');
    expect(result.parsed.errorType).toBe('UnhandledRejection');
    expect(result.parsed.errorMessage).toBe('ECONNREFUSED');
    expect(result.parsed.occurrences).toBe(1);
    expect(result.parsed.fingerprint).toBe('fetch-timeout-bc-456');
    expect(result.parsed.job).toBe('daily-report');
    expect(result.parsed.location).toBe('api/fetch-brands.js:78');
    expect(result.parsed.version).toBe('1.0.0');
    expect(result.parsed.stackTrace).toContain('api/fetch-brands.js:78');
    expect(result.parsed.breadcrumbs).toContain('Cron job started: daily-report');
    expect(result.parsed.breadcrumbs).toContain('Error in api/fetch-brands.js:78');
    expect(result.parsed.source).toBe('vps');
  });
});

describe('Extension Issue Parsing (Backward Compatibility)', () => {
  it('parses extension issue with section format (unchanged)', () => {
    const issue = {
      title: '[convert-my-file] TypeError: Cannot read property "data" of undefined',
      labels: [{ name: 'robot' }, { name: 'source:cloakpipe' }],
      number: 789,
      html_url: 'https://github.com/test/repo/issues/789',
      body: `## Error Details
- Extension: convert-my-file v1.0.0
- Message: Cannot read property "data" of undefined
- Timestamp: 2025-10-29T14:00:00Z
- Fingerprint: conv-undefined-data-123

## Stack Trace
\`\`\`
TypeError: Cannot read property "data" of undefined
  at content.js:45
  at background.js:120
\`\`\`

## Breadcrumbs
1. User clicked "Convert PDF"
2. Fetching file metadata
3. Processing conversion request
4. Error occurred`
    };

    const result = parseExtensionIssue(issue);

    expect(result.errors).toHaveLength(0);
    expect(result.parsed.extension).toBe('convert-my-file');
    expect(result.parsed.version).toBe('1.0.0');
    expect(result.parsed.errorType).toBe('TypeError');
    expect(result.parsed.fingerprint).toBe('conv-undefined-data-123');
    expect(result.parsed.stackTrace).toContain('content.js:45');
    expect(result.parsed.breadcrumbs).toHaveLength(4);
    expect(result.parsed.breadcrumbs[0]).toBe('User clicked "Convert PDF"');
    expect(result.parsed.source).toBe('extension');
  });
});

describe('parseLoggerIssue (Routing)', () => {
  it('routes WordPress issue to server parser', () => {
    const issue = {
      title: '[claudecode-wordpress-mcp] PDOException: Test',
      labels: [{ name: 'source:wordpress' }],
      body: `**Error Type:** PDOException
**Fingerprint:** test-123

## Stack Trace
\`\`\`
Test stack trace
\`\`\``
    };

    const result = parseLoggerIssue(issue);
    expect(result.parsed.source).toBe('wordpress');
  });

  it('routes VPS issue to server parser', () => {
    const issue = {
      title: '[brand-copilot] Error: Test',
      labels: [{ name: 'source:vps' }],
      body: `**Error Type:** Error
**Fingerprint:** test-456

## Stack Trace
\`\`\`
Test stack trace
\`\`\``
    };

    const result = parseLoggerIssue(issue);
    expect(result.parsed.source).toBe('vps');
  });

  it('routes extension issue to extension parser', () => {
    const issue = {
      title: '[convert-my-file] TypeError: Test',
      labels: [{ name: 'source:cloakpipe' }],
      body: `## Error Details
- Extension: convert-my-file v1.0.0
- Fingerprint: test-789

## Stack Trace
\`\`\`
Test stack trace
\`\`\`

## Breadcrumbs
1. Test breadcrumb`
    };

    const result = parseLoggerIssue(issue);
    expect(result.parsed.source).toBe('extension');
  });

  it('defaults to extension parser for backward compatibility', () => {
    const issue = {
      title: '[test-extension] Error: Test',
      labels: [{ name: 'robot' }], // No source label
      body: `## Error Details
- Extension: test-extension v1.0.0
- Fingerprint: test-default

## Stack Trace
\`\`\`
Test stack trace
\`\`\`

## Breadcrumbs
1. Test`
    };

    const result = parseLoggerIssue(issue);
    expect(result.parsed.source).toBe('extension');
  });
});

describe('Edge Cases', () => {
  it('handles missing occurrences field (defaults to 1)', () => {
    const issue = {
      title: '[claudecode-wordpress-mcp] Error: Test',
      labels: [{ name: 'source:wordpress' }],
      body: `**Error Type:** Error
**Fingerprint:** test

## Stack Trace
\`\`\`
Test
\`\`\``
    };

    const result = parseServerIssue(issue);
    expect(result.parsed.occurrences).toBe(1);
  });

  it('handles invalid occurrences value (defaults to 1)', () => {
    const issue = {
      title: '[claudecode-wordpress-mcp] Error: Test',
      labels: [{ name: 'source:wordpress' }],
      body: `**Error Type:** Error
**Occurrences:** invalid
**Fingerprint:** test

## Stack Trace
\`\`\`
Test
\`\`\``
    };

    const result = parseServerIssue(issue);
    expect(result.parsed.occurrences).toBe(1); // parseInt('invalid') = NaN, falls back to '1'
  });

  it('validates required fields for server issues', () => {
    const issue = {
      title: '[claudecode-wordpress-mcp] Error: Test',
      labels: [{ name: 'source:wordpress' }],
      body: '**Error Type:** Error'
      // Missing stack trace and fingerprint
    };

    const result = parseServerIssue(issue);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContain('Missing required field: stackTrace');
    expect(result.errors).toContain('Missing required field: fingerprint');
  });

  it('does not require breadcrumbs for server issues', () => {
    const issue = {
      title: '[claudecode-wordpress-mcp] Error: Test',
      labels: [{ name: 'source:wordpress' }],
      body: `**Error Type:** Error
**Fingerprint:** test

## Stack Trace
\`\`\`
Test
\`\`\``
    };

    const result = parseServerIssue(issue);
    // Should not have breadcrumbs error, but should have synthetic breadcrumbs
    const breadcrumbErrors = result.errors.filter(e => e.includes('breadcrumbs'));
    expect(breadcrumbErrors).toHaveLength(0);
    expect(result.parsed.breadcrumbs.length).toBeGreaterThan(0);
  });
});
