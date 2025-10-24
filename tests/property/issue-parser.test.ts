import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  extractCodeBlock,
  extractSection,
  parseBreadcrumbs,
  parseField,
  parseIssueTitle,
  parseLoggerIssue
} from '../../homeostat/routing/issue-parser.js';

const piiRegex = /(sk-|ghp_|eyJ|\/Users\/test|C:\\Users\\test|https?:\/\/[^\s]+:[^@]+@)/;

describe('issue-parser property tests', () => {
  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(() => parseLoggerIssue(input)).not.toThrow();
      })
    );
  });

  it('parsing is idempotent for valid issues', () => {
    const issueArb = fc.record({
      title: fc.string(),
      body: fc.string(),
      labels: fc.array(fc.record({ name: fc.string() }))
    });
    fc.assert(
      fc.property(issueArb, (issue) => {
        const first = parseLoggerIssue(issue);
        const second = parseLoggerIssue(issue);
        expect(second).toEqual(first);
      })
    );
  });

  it('sanitizes stack traces to remove PII patterns', () => {
    const stackArb = fc.string({ minLength: 0, maxLength: 200 }).map((stack) => `${stack}\n    at /Users/test/file.js:1:1`);
    fc.assert(
      fc.property(stackArb, (stack) => {
        const issue = {
          title: '[Example] Error: Something broke',
          body: `## Error Details\n- Extension: Example v1.0.0\n- Message: msg\n- Fingerprint: fp\n\n## Stack Trace\n\n\u0060\u0060\u0060\n${stack}\n\u0060\u0060\u0060\n\n## Breadcrumbs\n1. Step`,
          labels: [{ name: 'robot' }]
        };
        const { parsed } = parseLoggerIssue(issue);
        expect(parsed.stackTrace).not.toMatch(piiRegex);
      })
    );
  });

  it('extracts sections reliably even with noise', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (body, filler) => {
        const safeBody = body.replace(/##/g, '--');
        const decorated = `## Error Details\n- Message: ${filler}\n${safeBody}\n## Stack Trace\ncode\n## Breadcrumbs\n1. step`;
        const section = extractSection(decorated, '## Error Details');
        const normalizedSection = section.replace(/\s+/g, ' ');
        const normalizedFiller = filler.trim();
        if (normalizedFiller.length > 0) {
          expect(normalizedSection).toContain(normalizedFiller);
        } else {
          expect(section.length).toBeGreaterThan(0);
        }
      })
    );
  });

  it('breadcrumbs parsing drops numbering', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (crumbs) => {
        const section = crumbs.map((line, index) => `${index + 1}. ${line}`).join('\n');
        const parsed = parseBreadcrumbs(section);
        expect(parsed.length).toBe(parsed.filter((line) => line.trim().length > 0).length);
      })
    );
  });

  it('parseIssueTitle returns errors for malformed titles', () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const result = parseIssueTitle(title);
        if (!title.includes(']') || !title.includes(':')) {
          expect(result.errors.length).toBeGreaterThan(0);
        }
      })
    );
  });

  it('parseField handles random sections gracefully', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (section, value) => {
        const combined = `- Key: ${value}\n${section}`;
        const parsed = parseField(combined, 'Key');
        expect(parsed === '' || combined.includes(parsed)).toBe(true);
      })
    );
  });

  it('extractCodeBlock returns original when not wrapped', () => {
    fc.assert(
      fc.property(fc.string(), (section) => {
        const code = extractCodeBlock(section);
        if (!section.includes('```')) {
          expect(code).toBe(section.trim());
        }
      })
    );
  });
});
