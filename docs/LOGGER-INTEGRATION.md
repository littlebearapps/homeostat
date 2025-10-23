# Logger Integration

**Integration Contract**: This document defines the contract between [Logger](https://github.com/littlebearapps/logger) (error capture) and Homeostat (automated fixing).

## Overview

Homeostat receives error reports from the Logger via GitHub issues. The Logger captures errors in Chrome extensions, sanitizes all PII, and creates GitHub issues that trigger Homeostat's automated fixing workflow.

**Repositories**:
- **Logger**: https://github.com/littlebearapps/logger
- **Homeostat**: https://github.com/littlebearapps/homeostat (this repo)

## Workflow

```
┌──────────┐         ┌──────────────┐         ┌───────────┐
│ Extension│─ error ─>│    Logger    │─ issue ─>│ Homeostat │
│ (Chrome) │         │ (littlebearapps/logger)│ (this repo)│
└──────────┘         └──────────────┘         └───────────┘
                            │                        │
                            ▼                        ▼
                     1. Capture error          1. Parse issue
                     2. Sanitize PII           2. Analyze complexity
                     3. Create GitHub issue    3. Select AI tier
                        with 'robot' label     4. Attempt fix
                                              5. Run tests
                                              6. Create PR if pass
```

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
- `notebridge`, `palettekit`, `convert-my-file` - Extension identifier (used for GitHub Projects routing)

---

## Expected Issue Format

The Logger creates issues in this exact format:

### Issue Title

```
[ExtensionName] ErrorType: Error message
```

**Examples**:
- `[NoteBridge] TypeError: Cannot read property 'sync' of undefined`
- `[PaletteKit] ReferenceError: colorPicker is not defined`
- `[ConvertMyFile] NetworkError: Failed to fetch`

**Parsing**:
- Extension name: Between `[` and `]`
- Error type: After `]` before `:`
- Error message: After `:`

### Issue Body

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

---

## Field Specifications

### Required Fields

Homeostat **requires** these fields to function:

| Field | Location | Format | Purpose |
|-------|----------|--------|---------|
| **Extension Name** | Title | String (e.g., `NoteBridge`) | Context for fix |
| **Error Type** | Title + Error Details | String (e.g., `TypeError`) | Tier selection |
| **Error Message** | Title + Error Details | String | Understanding error |
| **Stack Trace** | Body section | Multi-line code block | Error location |
| **Timestamp** | Error Details | ISO 8601 (e.g., `2025-10-23T16:43:22Z`) | Deduplication |
| **Fingerprint** | Error Details | String (e.g., `abc123def456`) | Deduplication |
| **Breadcrumbs** | Body section | Numbered list | Debugging context |

### Optional Fields

| Field | Location | Format | Purpose |
|-------|----------|--------|---------|
| **User Description** | Body section | Free text | Additional context |

### Field Details

**Extension** (required):
- Format: `ExtensionName v1.2.0`
- Example: `NoteBridge v1.2.0`
- Parsing: Extract name and version separately

**Error Type** (required):
- Format: Standard JavaScript error type
- Examples: `TypeError`, `ReferenceError`, `NetworkError`, `QuotaExceededError`
- Used for tier selection (e.g., `SecurityError` → Tier 3)

**Timestamp** (required):
- Format: ISO 8601 UTC
- Example: `2025-10-23T16:43:22Z`
- Used for: Deduplication, time-based analysis

**Fingerprint** (required):
- Format: Hash string (MD5/SHA256 of stack trace)
- Example: `abc123def456`
- Used for: Deduplication (same error = same fingerprint)

**Stack Trace** (required):
- Format: Sanitized stack trace (PII removed)
- Sanitization: User paths, extension IDs, API keys removed
- Example:
  ```
  Error: Cannot read property 'sync' of undefined
      at syncNotes (background/sync.js:42:15)
      at <anonymous>:1:1
  ```

**Breadcrumbs** (required):
- Format: Numbered list (max 50)
- Example:
  ```
  1. User clicked "Sync Now" button
  2. Called syncNotes() function
  3. Accessed chrome.storage.sync
  4. Error thrown at background/sync.js:42
  ```
- Used for: Understanding user actions leading to error

---

## Parsing Logic

### Example: Parse Issue Title

```javascript
function parseIssueTitle(title) {
  // Title format: [ExtensionName] ErrorType: Error message
  const extensionMatch = title.match(/^\[([^\]]+)\]/);
  const errorMatch = title.match(/\]\s*([^:]+):\s*(.+)$/);

  if (!extensionMatch || !errorMatch) {
    throw new Error('Invalid issue title format');
  }

  return {
    extensionName: extensionMatch[1],        // "NoteBridge"
    errorType: errorMatch[1].trim(),         // "TypeError"
    errorMessage: errorMatch[2].trim()       // "Cannot read property 'sync'..."
  };
}
```

### Example: Parse Issue Body

```javascript
function parseIssueBody(body) {
  // Extract sections
  const sections = {
    errorDetails: extractSection(body, '## Error Details'),
    stackTrace: extractSection(body, '## Stack Trace'),
    breadcrumbs: extractSection(body, '## Breadcrumbs'),
    userDescription: extractSection(body, '## User Description')
  };

  // Parse Error Details
  const extension = parseField(sections.errorDetails, 'Extension');
  const [extensionName, version] = extension.split(' v');

  return {
    extension: extensionName,                           // "NoteBridge"
    version: version,                                   // "1.2.0"
    errorType: parseField(sections.errorDetails, 'Error Type'),
    message: parseField(sections.errorDetails, 'Message'),
    timestamp: parseField(sections.errorDetails, 'Timestamp'),
    fingerprint: parseField(sections.errorDetails, 'Fingerprint'),
    stackTrace: extractCodeBlock(sections.stackTrace),
    breadcrumbs: parseBreadcrumbs(sections.breadcrumbs),
    userDescription: sections.userDescription?.trim() || null
  };
}

function extractSection(body, sectionHeader) {
  const regex = new RegExp(`${sectionHeader}\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = body.match(regex);
  return match ? match[1].trim() : null;
}

function parseField(section, fieldName) {
  const regex = new RegExp(`^-\\s*${fieldName}:\\s*(.+)$`, 'm');
  const match = section?.match(regex);
  return match ? match[1].trim() : null;
}

function extractCodeBlock(section) {
  // Extract content between ``` markers
  const match = section?.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : section?.trim();
}

function parseBreadcrumbs(section) {
  if (!section) return [];

  // Parse numbered list: "1. Action\n2. Action\n..."
  const lines = section.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const match = line.match(/^\d+\.\s*(.+)$/);
    return match ? match[1].trim() : line.trim();
  });
}
```

### Example: Complete Parsing

```javascript
async function parseLoggerIssue(issue) {
  // Parse title
  const titleData = parseIssueTitle(issue.title);

  // Parse body
  const bodyData = parseIssueBody(issue.body);

  // Combine and validate
  const parsed = {
    // From title
    extensionName: titleData.extensionName,
    errorType: titleData.errorType,
    errorMessage: titleData.errorMessage,

    // From body
    version: bodyData.version,
    timestamp: new Date(bodyData.timestamp),
    fingerprint: bodyData.fingerprint,
    stackTrace: bodyData.stackTrace,
    breadcrumbs: bodyData.breadcrumbs,
    userDescription: bodyData.userDescription,

    // From issue metadata
    issueNumber: issue.number,
    issueUrl: issue.html_url,
    labels: issue.labels.map(l => l.name)
  };

  // Validate required fields
  const requiredFields = [
    'extensionName', 'errorType', 'errorMessage',
    'stackTrace', 'fingerprint', 'breadcrumbs'
  ];

  for (const field of requiredFields) {
    if (!parsed[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  return parsed;
}
```

---

## Privacy & Security

### Data Sanitization

**All data has been sanitized by Logger before reaching Homeostat.**

The Logger removes all PII using 18+ sanitization patterns:
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

   Expected format: [docs/LOGGER-INTEGRATION.md](https://github.com/littlebearapps/homeostat/blob/main/docs/LOGGER-INTEGRATION.md)

   Please verify the issue was created by Logger, or manually fix the format.
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

Homeostat should include tests that verify parsing of Logger's format:

```javascript
describe('Logger Integration', () => {
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

    const parsed = parseLoggerIssue(mockIssue);

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

    expect(() => parseLoggerIssue(invalidIssue)).toThrow('Invalid issue title format');
  });
});
```

---

## Versioning

This integration contract may evolve over time. Changes will be versioned:

**Current Version**: v1.0.0 (2025-10-23)

**Changelog**:
- **v1.0.0** (2025-10-23): Initial integration contract

**Breaking Changes**:
- If Logger changes issue format, this document MUST be updated
- Homeostat parsing logic MUST match documented format
- Both repositories should coordinate on format changes

---

## References

- **Logger Repository**: https://github.com/littlebearapps/logger
- **Logger Integration Docs**: See logger's `README.md` section "Integration with Homeostat"
- **Logger CLAUDE.md**: See "Integration with Homeostat" section
- **Homeostat Implementation**: See `docs/IMPLEMENTATION-ROADMAP.md` Phase 3

---

## Contact

For integration issues or format changes:
- Open issue in respective repository (logger or homeostat)
- Tag with `integration` label
- Coordinate changes to maintain compatibility
