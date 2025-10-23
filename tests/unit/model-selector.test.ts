import { afterEach, describe, expect, it } from 'vitest';
import selectModel, { extractFiles } from '../../homeostat/routing/model-selector.js';

function buildStack({ lines = 4, files = ['background/index.js'] }) {
  const entries = [];
  const entryCount = Math.max(0, lines - 1);
  for (let i = 0; i < entryCount; i++) {
    const file = files[Math.min(i, files.length - 1)];
    entries.push(`    at ${file}:${10 + i}:${5 + i}`);
  }
  return ['Error: boom', ...entries].join('\n');
}

afterEach(() => {
  delete process.env.HOMEOSTAT_FORCE_TIER;
});

describe('model-selector: extractFiles', () => {
  it('extracts unique files from stack trace', () => {
    const stack = `Error\n    at background/index.js:10:2\n    at background/index.js:11:3\n    at content/script.js:5:1`;
    expect(extractFiles(stack)).toEqual(['background/index.js', 'content/script.js']);
  });

  it('handles malformed stacks gracefully', () => {
    expect(extractFiles('')).toEqual([]);
    expect(extractFiles('Error without locations')).toEqual([]);
  });
});

describe('model-selector: threshold boundaries', () => {
  it('routes 4-line stack with single file to tier 1', () => {
    const result = selectModel({ stack: buildStack({ lines: 4, files: ['popup/index.js'] }) });
    expect(result.tier).toBe(1);
    expect(result.model).toBe('deepseek-v3.2-exp');
    expect(result.sanitize).toBe(true);
  });

  it('routes 5-line stack with single file to tier 1', () => {
    const result = selectModel({ stack: buildStack({ lines: 5, files: ['popup/index.js'] }) });
    expect(result.tier).toBe(1);
  });

  it('routes 6-line stack with single file to tier 2', () => {
    const result = selectModel({ stack: buildStack({ lines: 6, files: ['popup/index.js'] }) });
    expect(result.tier).toBe(2);
  });

  it('routes 10-line stack with three files to tier 2', () => {
    const result = selectModel({ stack: buildStack({ lines: 10, files: ['a.js', 'b.js', 'c.js'] }) });
    expect(result.tier).toBe(2);
    expect(result.reviewer).toBe('gpt-5');
  });

  it('routes 16-line stack to tier 3', () => {
    const result = selectModel({ stack: buildStack({ lines: 16, files: ['a.js', 'b.js', 'c.js'] }) });
    expect(result.tier).toBe(3);
  });

  it('routes multiple files with low depth to tier 2', () => {
    const result = selectModel({ stack: buildStack({ lines: 4, files: ['a.js', 'b.js'] }) });
    expect(result.tier).toBe(2);
  });

  it('routes sensitive files to tier 3 regardless of complexity', () => {
    const stack = 'Error\n    at shared/api-keys.js:1:1';
    expect(selectModel({ stack }).tier).toBe(3);
  });

  it('respects forced tier overrides', () => {
    process.env.HOMEOSTAT_FORCE_TIER = '2';
    const result = selectModel({ stack: buildStack({ lines: 20, files: ['a.js'] }) });
    expect(result.tier).toBe(2);
    expect(result.model).toBe('deepseek-v3.2-exp');
  });

  it('defaults forced tier to 3 for invalid values', () => {
    process.env.HOMEOSTAT_FORCE_TIER = '5';
    expect(selectModel({ stack: buildStack({ lines: 2, files: ['a.js'] }) }).tier).toBe(3);
  });

  it('handles extremely deep stacks efficiently', () => {
    const stack = buildStack({ lines: 120, files: ['background/index.js', 'shared/util.js'] });
    const result = selectModel({ stack });
    expect(result.tier).toBe(3);
  });

  it('handles stacks with spaces and parentheses', () => {
    const stack = 'Error\n    at Object.<anonymous> (background/index.js:10:2)';
    expect(extractFiles(stack)).toEqual(['background/index.js']);
  });

  it('handles windows paths in stack', () => {
    const stack = 'Error\n    at C:\\workspace\\background\\index.js:10:2';
    expect(extractFiles(stack)).toEqual(['background/index.js']);
  });

  it('keeps sanitize flag true in all cases', () => {
    const cases = [
      selectModel({ stack: buildStack({ lines: 4 }) }),
      selectModel({ stack: buildStack({ lines: 10, files: ['a.js', 'b.js'] }) }),
      selectModel({ stack: buildStack({ lines: 20, files: ['a.js'] }) })
    ];
    cases.forEach((result) => expect(result.sanitize).toBe(true));
  });

  it('handles empty stack gracefully by defaulting to tier 3', () => {
    expect(selectModel({ stack: '' }).tier).toBe(3);
  });

  it('deduplicates repeated file entries', () => {
    const stack = 'Error\n    at background/index.js:10:2\n    at background/index.js:10:2';
    expect(extractFiles(stack)).toEqual(['background/index.js']);
  });
});
