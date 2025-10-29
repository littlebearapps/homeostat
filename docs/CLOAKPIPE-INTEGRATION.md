# CloakPipe Integration

**Integration Contract**: This document defines the contract between [CloakPipe](https://github.com/littlebearapps/cloakpipe) (error capture) and Homeostat (automated fixing).

**Version**: v2.0.0 (Multi-Platform Support)

## Overview

Homeostat receives error reports from CloakPipe via GitHub issues. CloakPipe captures errors from **multiple sources**, sanitizes all PII, and creates GitHub issues that trigger Homeostat's automated fixing workflow.

**Supported Platforms**:
- **Chrome Extensions**: NoteBridge, PaletteKit, Convert My File (browser-based errors)
- **WordPress Plugins**: CloudCode WordPress plugin (server-side PHP errors)
- **VPS Tools**: Brand Copilot, Auditor Toolkit (server-side Node.js/Python errors)

**Repositories**:
- **CloakPipe**: https://github.com/littlebearapps/cloakpipe
- **Homeostat**: https://github.com/littlebearapps/homeostat (this repo)

## Workflow

```
┌──────────────┐         ┌──────────────┐         ┌───────────┐
│ Error Source │─ error ─>│  CloakPipe   │─ issue ─>│ Homeostat │
│  - Chrome    │         │ (littlebearapps/cloakpipe)│(this repo)│
│  - WordPress │         └──────────────┘         └───────────┘
│  - VPS Tools │                │                        │
└──────────────┘                ▼                        ▼
                         1. Capture error          1. Detect source
                         2. Sanitize PII           2. Parse issue
                         3. Create GitHub issue    3. Analyze complexity
                            with 'robot' label     4. Select AI tier
                            + source label         5. Attempt fix
                                                  6. Run tests
                                                  7. Create PR if pass
```

**Source Detection**: Homeostat automatically detects the error source from GitHub issue labels and routes to the appropriate parser.

## Trigger Mechanism

Homeostat activates when a GitHub issue is created with the **`robot` label**.

**GitHub Actions Workflow**:
```yaml
on:
  issues:
    types: [labeled]

jobs:
  fix:
    if: github.event.label.name == 'robot'
    uses: littlebearapps/homeostat/.github/workflows/fix-error.yml@main
    secrets: inherit
```

**Labels**:
- `robot` (required) - Triggers Homeostat workflow
- **Source Labels** (required for routing):
  - `source:cloakpipe` - Chrome extensions (default for backward compatibility)
  - `source:wordpress` - WordPress plugins
  - `source:vps` - VPS tools (Node.js/Python)
- Product identifiers: `notebridge`, `palettekit`, `convert-my-file` (used for GitHub Projects routing)

---

## Source Detection

Homeostat uses a **dual parser architecture** to support multiple platforms:

```javascript
function detectSource(labels = []) {
  const labelNames = labels.map(l => l.toLowerCase());

  if (labelNames.includes('source:wordpress')) return 'wordpress';
  if (labelNames.includes('source:vps')) return 'vps';
  if (labelNames.includes('source:cloakpipe')) return 'extension';

  // Default: Extension (backward compatibility)
  return 'extension';
}
```

**Routing**:
- `wordpress` or `vps` → `parseServerIssue()` (inline `**Field:** value` format)
- `extension` (default) → `parseExtensionIssue()` (section `## Header` format)

---

## Expected Issue Formats

CloakPipe creates issues in different formats depending on the source:

### Format 1: Chrome Extensions (Section-Based) ✅ UNCHANGED

**Used for**: Chrome, Firefox, Safari, Edge browser extensions

**Labels**: `robot`, `source:cloakpipe` (or no source label for backward compatibility)

#### Issue Title

```
[ExtensionName] ErrorType: Error message
```

**Examples**:
- `[NoteBridge] TypeError: Cannot read property 'sync' of undefined`
- `[PaletteKit] ReferenceError: colorPicker is not defined`
- `[convert-my-file] NetworkError: Failed to fetch`

**Parsing**:
- Extension name: Between `[` and `]`
- Error type: After `]` before `:`
- Error message: After `:`

#### Issue Body (Section Format)

```markdown
## Error Details
- Extension: ExtensionName v1.2.0
- Error Type: TypeError
- Message: Cannot read property 'sync' of undefined
- Timestamp: 2025-10-23T16:43:22Z
- Fingerprint: abc123def456

## Stack Trace
```
Error: Cannot read property 'sync' of undefined
    at syncNotes (background/sync.js:42:15)
    at <anonymous>:1:1
```

## Breadcrumbs
1. User clicked "Sync Now" button
2. Called syncNotes() function
3. Accessed chrome.storage.sync
4. Error thrown at background/sync.js:42

## User Description
(optional - only present if user submitted via manual reporting)
User was trying to sync notes when the error occurred.
```

**Key Characteristics**:
- ✅ Uses `## Section` headers
- ✅ Requires `## Breadcrumbs` section (user action trail)
- ✅ Field format: `- FieldName: value`

---

### Format 2: Server Errors (Inline Field Format) 🆕 NEW

**Used for**: WordPress plugins, VPS tools (Node.js/Python)

**Labels**: `robot`, `source:wordpress` OR `source:vps`

#### Issue Title (Same Format)

```
[ProductName] ErrorType: Error message
```

**Examples**:
- `[claudecode-wordpress-mcp] PDOException: Database connection failed`
- `[brand-copilot] UnhandledRejection: ECONNREFUSED`
- `[auditor-toolkit] ValueError: Invalid CSV format`

**Product Names**:
- `claudecode-wordpress-mcp` - WordPress plugin (matches GitHub repo name)
- `brand-copilot` - VPS Brand Copilot tool (matches GitHub repo name)
- `auditor-toolkit` - VPS Auditor Toolkit (matches GitHub repo name)

#### Issue Body (Inline Field Format)

**WordPress Example**:
```markdown
**Error Type:** PDOException
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
```
PDOException: SQLSTATE[HY000] [2002] Connection refused
  at includes/database.php:45
  at includes/backup.php:120
```

## Context
User initiated backup operation
```

**VPS Example**:
```markdown
**Error Type:** UnhandledRejection
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
```
NetworkError: Request timeout after 30s
  at api/fetch-brands.js:78
  at cron/daily-sync.js:34
```

## Context
Daily cron job (3am) - last successful run 24h ago
```

**Key Characteristics**:
- 🆕 Uses `**Field:** value` inline format (NOT `- Field:`)
- 🆕 Does NOT have `## Error Details` section
- 🆕 Does NOT require `## Breadcrumbs` section (servers don't have user actions)
- ✅ Still uses `## Stack Trace` and `## Error Message` sections
- 🆕 Uses `## Context` instead of user description
- 🆕 Supports `**Occurrences:** N` for error frequency tracking
- 🆕 VPS-specific: `**Job:**` (cron job name), `**Location:**` (file:line)

#### Synthetic Breadcrumbs

Since servers don't have user action trails, Homeostat **generates synthetic breadcrumbs** from available context:

```javascript
function generateSyntheticBreadcrumbs(parsed) {
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
    breadcrumbs.push(`Context: ${contextPreview}...`);
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
```

**Example Synthetic Breadcrumbs**:
```
1. Cron job started: daily-report
2. Error in api/fetch-brands.js:78
3. Context: Daily cron job (3am) - last successful run 24h ago
4. Error thrown: UnhandledRejection
```

---

## Field Specifications

### Required Fields (All Sources)

Homeostat **requires** these fields to function:

| Field | Location | Format | Purpose | Extensions | Servers |
|-------|----------|--------|---------|-----------|---------|
| **Product/Extension Name** | Title | String | Context for fix | ✅ Required | ✅ Required |
| **Error Type** | Title + Body | String (e.g., `TypeError`) | Tier selection | ✅ Required | ✅ Required |
| **Error Message** | Title + Body | String | Understanding error | ✅ Required | ✅ Required |
| **Stack Trace** | `## Stack Trace` | Multi-line code block | Error location | ✅ Required | ✅ Required |
| **Timestamp** | Body | ISO 8601 | Deduplication | ✅ Required | ✅ Required |
| **Fingerprint** | Body | String (hash) | Deduplication | ✅ Required | ✅ Required |
| **Breadcrumbs** | `## Breadcrumbs` OR synthetic | Numbered list | Debugging context | ✅ Required | 🆕 Generated |
| **Source Label** | Labels | `source:*` | Parser routing | Optional* | ✅ Required |

*Extensions default to `extension` for backward compatibility if no `source:` label present.

### Optional Fields

| Field | Extensions | Servers | Purpose |
|-------|-----------|---------|---------|
| **User Description** | ✅ Optional | ❌ N/A | Additional context from manual reports |
| **Version** | ✅ Required | ✅ Optional | Extension/plugin/tool version |
| **Occurrences** | ❌ N/A | 🆕 Optional | Error frequency (WordPress/VPS) |
| **Environment** | ❌ N/A | 🆕 Optional | production/staging/dev |
| **Location** | ❌ N/A | 🆕 Optional | file:line (VPS cron jobs) |
| **Job** | ❌ N/A | 🆕 Optional | Cron job name (VPS) |
| **Context** | ❌ N/A | 🆕 Optional | General context (servers) |

### Field Details

#### Extension/Product Name (required)

**Extensions**:
- Format: `ExtensionName v1.2.0` (in `## Error Details`)
- Example: `NoteBridge v1.2.0`
- Parsing: Extract name and version separately

**Servers**:
- Format: `**Product:** ProductName` OR extracted from title
- Examples: `claudecode-wordpress-mcp`, `brand-copilot`, `auditor-toolkit`
- Parsing: Use `parseInlineField(body, 'Product')` OR title extraction

#### Error Type (required)

- **Extensions**: Standard JavaScript error types
  - Examples: `TypeError`, `ReferenceError`, `NetworkError`, `QuotaExceededError`
- **WordPress**: PHP exception class names
  - Examples: `PDOException`, `RuntimeException`, `InvalidArgumentException`
  - Extraction: `get_class($exception)` (no `PHP\` prefix)
- **VPS**: Python/Node.js exception class names
  - Python: `type(exception).__name__` → `ValueError`, `RuntimeError`
  - Node.js: `error.constructor.name` → `TypeError`, `UnhandledRejection`
- Used for tier selection (e.g., `SecurityError` → Tier 3)

#### Timestamp (required)

- Format: ISO 8601 UTC
- Example: `2025-10-23T16:43:22Z`
- Used for: Deduplication, time-based analysis

#### Fingerprint (required)

- Format: Hash string (MD5/SHA256 of stack trace)
- Example: `abc123def456`
- Used for: Deduplication (same error = same fingerprint)

#### Stack Trace (required)

- Format: Sanitized stack trace (PII removed)
- Sanitization: User paths, extension IDs, API keys removed
- **Extensions Example**:
  ```
  Error: Cannot read property 'sync' of undefined
      at syncNotes (background/sync.js:42:15)
      at <anonymous>:1:1
  ```
- **WordPress Example**:
  ```
  PDOException: SQLSTATE[HY000] [2002] Connection refused
    at includes/database.php:45
    at includes/backup.php:120
  ```
- **VPS Example**:
  ```
  NetworkError: Request timeout after 30s
    at api/fetch-brands.js:78
    at cron/daily-sync.js:34
  ```

#### Breadcrumbs

**Extensions** (required, user-provided):
- Format: Numbered list (max 50) in `## Breadcrumbs` section
- Example:
  ```
  1. User clicked "Sync Now" button
  2. Called syncNotes() function
  3. Accessed chrome.storage.sync
  4. Error thrown at background/sync.js:42
  ```
- Used for: Understanding user actions leading to error

**Servers** (generated synthetically by Homeostat):
- No `## Breadcrumbs` section in issue (servers don't track user actions)
- Homeostat generates from available context:
  - Cron job name (`**Job:** daily-report`)
  - Error location (`**Location:** api/fetch-brands.js:78`)
  - General context (`## Context` section)
  - Error type
- Example generated breadcrumbs:
  ```
  1. Cron job started: daily-report
  2. Error in api/fetch-brands.js:78
  3. Context: Daily cron job (3am)...
  4. Error thrown: UnhandledRejection
  ```

#### Occurrences (servers only, optional)

- Format: `**Occurrences:** N`
- Example: `**Occurrences:** 3`
- Default: 1 if missing or invalid
- Used for: Understanding error frequency, prioritization
- **Note**: Extensions don't track occurrences (each report = 1 error)

---

## Parsing Logic

### Source Detection and Routing

```javascript
/**
 * Main entry point - route to appropriate parser based on source
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

/**
 * Detect source type from issue labels
 */
function detectSource(labels = []) {
  const labelNames = labels
    .map(l => typeof l === 'string' ? l : l?.name)
    .filter(Boolean)
    .map(l => l.toLowerCase());

  if (labelNames.includes('source:wordpress')) return 'wordpress';
  if (labelNames.includes('source:vps')) return 'vps';
  if (labelNames.includes('source:cloakpipe')) return 'extension';

  // Default: Extension (backward compatibility)
  return 'extension';
}
```

### Extension Parser (Section Format)

```javascript
/**
 * Parse extension issue (Chrome, Firefox, Safari, Edge) with section format
 * Template: ## Section headers
 */
export function parseExtensionIssue(issue = {}) {
  const safeIssue = typeof issue === 'object' && issue !== null ? issue : {};
  const errors = [];

  // Parse title
  const titleData = parseIssueTitle(safeIssue.title);
  errors.push(...titleData.errors);

  const body = asString(safeIssue.body);

  // Extract sections
  const errorDetailsSection = extractSection(body, '## Error Details');
  const stackSection = extractSection(body, '## Stack Trace');
  const breadcrumbsSection = extractSection(body, '## Breadcrumbs');

  // Parse Error Details section
  const message = parseField(errorDetailsSection, 'Message');
  const fingerprint = parseField(errorDetailsSection, 'Fingerprint');
  const extensionLine = parseField(errorDetailsSection, 'Extension');
  const [extensionName, version] = extensionLine.split(/\sv/);

  const rawStack = extractCodeBlock(stackSection);
  const sanitizedStack = sanitizeStackTrace(rawStack);
  const breadcrumbs = parseBreadcrumbs(breadcrumbsSection);

  // Validate required fields
  if (!sanitizedStack) errors.push('Missing required field: stackTrace');
  if (!fingerprint) errors.push('Missing required field: fingerprint');
  if (!breadcrumbs.length) errors.push('Missing required field: breadcrumbs');

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
    source: 'extension'
  };

  return { parsed, errors };
}

// Helper functions
function extractSection(body, sectionHeader) {
  const regex = new RegExp(`${sectionHeader}\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = body.match(regex);
  return match ? match[1].trim() : '';
}

function parseField(section, fieldName) {
  const regex = new RegExp(`^-\\s*${fieldName}:\\s*(.+)$`, 'mi');
  const match = section?.match(regex);
  return match ? match[1].trim() : '';
}

function parseBreadcrumbs(section) {
  if (!section) return [];
  return section
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^\d+\.\s*(.+)$/);
      return match ? match[1].trim() : line;
    });
}
```

### Server Parser (Inline Field Format) 🆕

```javascript
/**
 * Parse server issue (WordPress, VPS) with inline field format
 * Template: **Field:** value
 */
export function parseServerIssue(issue = {}) {
  const safeIssue = typeof issue === 'object' && issue !== null ? issue : {};
  const errors = [];

  // Parse title
  const titleData = parseIssueTitle(safeIssue.title);
  errors.push(...titleData.errors);

  const body = asString(safeIssue.body);

  // Parse inline fields (WordPress/VPS format)
  const product = parseInlineField(body, 'Product') || titleData.extension || '';
  const occurrencesStr = parseInlineField(body, 'Occurrences') || '1';
  const occurrences = parseInt(occurrencesStr, 10) || 1; // Handle NaN
  const fingerprint = parseInlineField(body, 'Fingerprint');
  const location = parseInlineField(body, 'Location');
  const job = parseInlineField(body, 'Job'); // VPS cron job name
  const timestamp = parseInlineField(body, 'Timestamp');
  const version = parseInlineField(body, 'Version') ||
                  parseInlineField(body, 'Plugin Version') ||
                  parseInlineField(body, 'Tool Version');
  const environment = parseInlineField(body, 'Environment');

  // Extract stack trace and context from sections
  const messageSection = extractSection(body, '## Error Message');
  const stackSection = extractSection(body, '## Stack Trace');
  const contextSection = extractSection(body, '## Context');

  const rawStack = extractCodeBlock(stackSection);
  const sanitizedStack = sanitizeStackTrace(rawStack);

  // Validation (servers don't require breadcrumbs)
  if (!sanitizedStack) errors.push('Missing required field: stackTrace');
  if (!fingerprint) errors.push('Missing required field: fingerprint');

  const parsed = {
    extension: product,
    product,
    version,
    errorType: titleData.errorType || '',
    errorMessage: titleData.errorMessage || messageSection || '',
    message: messageSection || titleData.errorMessage || '',
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
    source: detectSource(safeIssue.labels)
  };

  // Generate synthetic breadcrumbs
  parsed.breadcrumbs = generateSyntheticBreadcrumbs(parsed);

  return { parsed, errors };
}

/**
 * Parse inline field from server issue body
 * Format: **FieldName:** value
 */
function parseInlineField(body = '', fieldName = '') {
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
 */
function generateSyntheticBreadcrumbs(parsed = {}) {
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
```

### Common Helpers

```javascript
function parseIssueTitle(title = '') {
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

function extractCodeBlock(section = '') {
  const normalized = asString(section);
  const codeMatch = normalized.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
  return codeMatch ? codeMatch[1].trim() : normalized.trim();
}

function asString(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
}

function normalizeLabels(labels = []) {
  if (!Array.isArray(labels)) return [];
  return labels
    .map(label => typeof label === 'string' ? label : label?.name)
    .filter(Boolean);
}
```

---

## Privacy & Security

### Data Sanitization

**All data has been sanitized by CloakPipe before reaching Homeostat.**

CloakPipe removes all PII using 18+ sanitization patterns:
- ✅ User file paths → generic paths (e.g., `/Users/<REDACTED>`)
- ✅ Extension IDs → placeholder IDs (e.g., `chrome-extension://<EXT_ID>`)
- ✅ API keys → redacted (e.g., `<OPENAI_KEY_REDACTED>`)
- ✅ Tokens & JWTs → redacted (e.g., `<JWT_REDACTED>`)
- ✅ Email addresses → redacted (e.g., `<EMAIL_REDACTED>`)
- ✅ IP addresses → redacted (e.g., `<IP_REDACTED>`)

**Homeostat should NOT need additional PII sanitization**, but should validate that sensitive patterns are not present.

### Validation Checks

Before processing, Homeostat should verify:

```javascript
function validateSanitization(stackTrace) {
  // Check for common PII patterns that should have been sanitized
  const piiPatterns = [
    /\/Users\/[^/]+/,                    // User paths
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/,  // Emails
    /sk-[a-zA-Z0-9]{48}/,                 // API keys
    /ghp_[a-zA-Z0-9]{36}/                 // GitHub tokens
  ];

  for (const pattern of piiPatterns) {
    if (pattern.test(stackTrace)) {
      throw new Error('PII detected in stack trace - sanitization failed');
    }
  }
}
```

---

## Error Handling

### Invalid Format

If Homeostat cannot parse the issue:

1. **Add label**: `parsing-error`
2. **Comment on issue**:
   ```
   ⚠️ Homeostat could not parse this issue.

   Expected format: [docs/CLOAKPIPE-INTEGRATION.md](https://github.com/littlebearapps/homeostat/blob/main/docs/CLOAKPIPE-INTEGRATION.md)

   Please verify the issue was created by CloakPipe, or manually fix the format.
   ```
3. **Do NOT attempt fix** - wait for human intervention

### Missing Required Fields

If required fields are missing:

1. **Add label**: `incomplete`
2. **Comment on issue** listing missing fields
3. **Close issue** if cannot be fixed

### Fingerprint Collision

If fingerprint matches existing issue:

1. **Add comment** to original issue: "Duplicate error detected at [timestamp]"
2. **Close new issue** as duplicate
3. **Do NOT re-attempt fix** (avoid infinite loops)

---

## Testing

### Integration Tests

Homeostat should include tests that verify parsing of CloakPipe's format:

```javascript
describe('CloakPipe Integration', () => {
  it('should parse valid logger issue', () => {
    const mockIssue = {
      title: '[NoteBridge] TypeError: Cannot read property sync',
      body: `
## Error Details
- Extension: NoteBridge v1.2.0
- Error Type: TypeError
- Message: Cannot read property 'sync' of undefined
- Timestamp: 2025-10-23T16:43:22Z
- Fingerprint: abc123

## Stack Trace
\`\`\`
Error at sync.js:42
\`\`\`

## Breadcrumbs
1. User clicked button
2. Error thrown
      `,
      labels: [{ name: 'robot' }, { name: 'notebridge' }],
      number: 123,
      html_url: 'https://github.com/...'
    };

    const parsed = parseCloakPipeIssue(mockIssue);

    expect(parsed.extensionName).toBe('NoteBridge');
    expect(parsed.errorType).toBe('TypeError');
    expect(parsed.fingerprint).toBe('abc123');
    expect(parsed.breadcrumbs).toHaveLength(2);
  });

  it('should reject invalid format', () => {
    const invalidIssue = {
      title: 'Some random error',
      body: 'Not in logger format',
      labels: [{ name: 'robot' }]
    };

    expect(() => parseCloakPipeIssue(invalidIssue)).toThrow('Invalid issue title format');
  });
});
```

---

## Versioning

This integration contract may evolve over time. Changes will be versioned:

**Current Version**: v2.0.0 (2025-10-29)

**Changelog**:
- **v2.0.0** (2025-10-29): Multi-platform support (WordPress, VPS)
  - Added dual parser architecture with source detection
  - Added inline field format (`**Field:** value`) for server errors
  - Added synthetic breadcrumb generation for servers
  - Added support for WordPress PHP, VPS Python/Node.js errors
  - Added `source:wordpress` and `source:vps` labels
  - Maintained 100% backward compatibility with existing extensions
  - Default to `extension` parser for unlabeled issues
- **v1.0.0** (2025-10-23): Initial integration contract
  - Chrome extension support only
  - Section-based format (`## Header`)

**Breaking Changes**:
- ✅ **v2.0.0 is 100% backward compatible** with v1.0.0
  - Existing extension issues work unchanged
  - No source label defaults to extension parser
  - All existing tests passing
- Future changes requiring label or format modifications will be coordinated between Cloakpipe and Homeostat

---

## References

- **CloakPipe Repository**: https://github.com/littlebearapps/cloakpipe
- **CloakPipe Integration Docs**: See cloakpipe's `README.md` section "Integration with Homeostat"
- **CloakPipe CLAUDE.md**: See "Integration with Homeostat" section
- **Homeostat Implementation**: See `docs/IMPLEMENTATION-ROADMAP.md` Phase 3

---

## Contact

For integration issues or format changes:
- Open issue in respective repository (cloakpipe or homeostat)
- Tag with `integration` label
- Coordinate changes to maintain compatibility
