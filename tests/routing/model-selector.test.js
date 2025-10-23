import { describe, expect, it } from 'vitest';
import selectModel, { extractFiles } from '../../homeostat/routing/model-selector.js';

describe('extractFiles', () => {
  it('parses multiple files from stack trace', () => {
    const stack = [
      'Error: Example',
      '    at handle (/Users/tester/project/background/auth.js:10:5)',
      '    at main (/Users/tester/project/shared/encryption.js:20:3)',
      '    at run (C:/Users/Test/project/src/index.js:30:7)'
    ].join('\n');
    expect(extractFiles(stack)).toEqual([
      'background/auth.js',
      'shared/encryption.js',
      'src/index.js'
    ]);
  });
});

describe('selectModel', () => {
  it('routes sensitive files to tier 3 GPT-5', () => {
    const stack = 'Error\n    at handler (/app/shared/api-keys.js:10:5)';
    const result = selectModel({ stack });
    expect(result).toEqual({ tier: 3, model: 'gpt-5', sanitize: true, attempts: 1 });
  });

  it('routes simple errors to tier 1', () => {
    const stack = [
      'Error',
      '    at render (/app/src/popup.js:2:1)'
    ].join('\n');
    const result = selectModel({ stack });
    expect(result).toEqual({ tier: 1, model: 'deepseek-v3.2-exp', sanitize: true, attempts: 2 });
  });

  it('routes moderate errors to tier 2 with reviewer', () => {
    const stack = [
      'Error',
      '    at a (/app/src/popup.js:2:1)',
      '    at b (/app/src/background.js:3:1)',
      '    at c (/app/src/content.js:4:1)'
    ].join('\n');
    const result = selectModel({ stack });
    expect(result).toEqual({
      tier: 2,
      model: 'deepseek-v3.2-exp',
      reviewer: 'gpt-5',
      sanitize: true,
      attempts: 2
    });
  });

  it('routes complex errors to tier 3 GPT-5', () => {
    const stackLines = ['Error'];
    for (let i = 0; i < 20; i++) {
      stackLines.push(`    at fn${i} (/app/src/file${i}.js:1:1)`);
    }
    const result = selectModel({ stack: stackLines.join('\n') });
    expect(result).toEqual({ tier: 3, model: 'gpt-5', sanitize: true, attempts: 1 });
  });
});
