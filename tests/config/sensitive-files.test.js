import { describe, expect, it } from 'vitest';
import isSensitiveFile, { SENSITIVE_PATTERNS } from '../../homeostat/config/sensitive-files.js';

describe('Sensitive file detection', () => {
  it('includes required patterns from PRIVACY-SECURITY-GUIDE', () => {
    expect(SENSITIVE_PATTERNS.length).toBeGreaterThanOrEqual(9);
  });

  it('identifies manifest.json as sensitive', () => {
    expect(isSensitiveFile('manifest.json')).toBe(true);
  });

  it('detects auth.js files in any directory', () => {
    expect(isSensitiveFile('background/auth.js')).toBe(true);
    expect(isSensitiveFile('src/pages/settings/auth.js')).toBe(true);
  });

  it('detects shared secret modules', () => {
    expect(isSensitiveFile('shared/api-keys.js')).toBe(true);
    expect(isSensitiveFile('shared/oauth.js')).toBe(true);
    expect(isSensitiveFile('shared/encryption.js')).toBe(true);
    expect(isSensitiveFile('shared/payment.js')).toBe(true);
    expect(isSensitiveFile('shared/user-data.js')).toBe(true);
  });

  it('detects directory-based sensitive paths', () => {
    expect(isSensitiveFile('config/secrets/prod.json')).toBe(true);
    expect(isSensitiveFile('shared/security/audit.js')).toBe(true);
  });

  it('handles Windows and relative paths', () => {
    expect(isSensitiveFile('\\shared\\security\\alerts.js')).toBe(true);
    expect(isSensitiveFile('./config/secrets/token.json')).toBe(true);
  });

  it('does not flag generic files', () => {
    expect(isSensitiveFile('src/popup.js')).toBe(false);
    expect(isSensitiveFile('src/utils/helpers.js')).toBe(false);
    expect(isSensitiveFile('styles.css')).toBe(false);
  });
});
