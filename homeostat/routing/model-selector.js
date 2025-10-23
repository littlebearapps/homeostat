/**
 * Model selection logic per PRIVACY-SECURITY-GUIDE.md lines 416-487 and
 * IMPLEMENTATION-ROADMAP.md lines 122-162.
 */
import { isSensitiveFile } from '../config/sensitive-files.js';

function normalizePath(filePath = '') {
  let normalized = filePath.trim();
  normalized = normalized.replace(/^[('"\s]+/, '').replace(/[)'"\s]+$/, '');
  normalized = normalized.replace(/\\/g, '/');
  return normalized;
}

export function extractFiles(stackTrace = '') {
  if (!stackTrace) return [];
  const files = new Set();
  const lines = stackTrace.split('\n');
  for (const line of lines) {
    const match = line.match(/(?:at\s+[^()]*\()?([^\s():]+):\d+:\d+/);
    if (!match) continue;
    let file = normalizePath(match[1]);
    file = file.replace(/^[A-Za-z]:\//, '').replace(/^\.\//, '').replace(/^\//, '');
    const anchors = [
      'manifest.json',
      'background/',
      'shared/',
      'config/',
      'homeostat/',
      'src/',
      'content/',
      'scripts/'
    ];
    for (const anchor of anchors) {
      const idx = file.indexOf(anchor);
      if (idx >= 0) {
        file = file.slice(idx);
        break;
      }
    }
    if (!file) continue;
    files.add(file);
  }
  return Array.from(files);
}

export function selectModel(error = {}) {
  const stack = error.stack ?? '';
  const filesInvolved = extractFiles(stack);

  const forcedTier = process?.env?.HOMEOSTAT_FORCE_TIER;
  if (forcedTier) {
    const tierNumber = Number(forcedTier);
    if (tierNumber === 1) {
      return { tier: 1, model: 'deepseek-v3.2-exp', sanitize: true, attempts: 2 };
    }
    if (tierNumber === 2) {
      return {
        tier: 2,
        model: 'deepseek-v3.2-exp',
        reviewer: 'gpt-5',
        sanitize: true,
        attempts: 2
      };
    }
    return { tier: 3, model: 'gpt-5', sanitize: true, attempts: 1 };
  }

  if (!stack.trim() || filesInvolved.length === 0) {
    return { tier: 3, model: 'gpt-5', sanitize: true, attempts: 1 };
  }

  if (filesInvolved.some((file) => isSensitiveFile(file))) {
    return { tier: 3, model: 'gpt-5', sanitize: true, attempts: 1 };
  }

  const stackDepth = stack ? stack.split('\n').length : 0;
  const fileCount = filesInvolved.length;

  if (stackDepth <= 5 && fileCount === 1) {
    return { tier: 1, model: 'deepseek-v3.2-exp', sanitize: true, attempts: 2 };
  }

  if (stackDepth < 15 && fileCount <= 3) {
    return {
      tier: 2,
      model: 'deepseek-v3.2-exp',
      reviewer: 'gpt-5',
      sanitize: true,
      attempts: 2
    };
  }

  return { tier: 3, model: 'gpt-5', sanitize: true, attempts: 1 };
}

export default selectModel;
