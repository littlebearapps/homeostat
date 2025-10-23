import { describe, expect, it } from 'vitest';
import { isSensitiveFile } from '../../homeostat/config/sensitive-files.js';

const SENSITIVE_PATHS = [
  'manifest.json',
  'background/auth.js',
  'shared/api-keys.js',
  'shared/oauth.js',
  'shared/encryption.js',
  'shared/payment.js',
  'shared/stripe.js',
  'shared/user-data.js',
  'config/secrets/keys.json',
  'shared/security/audit.js',
  'src/token-store.js'
];

describe('sensitive-files: detection', () => {
  it('flags canonical sensitive files', () => {
    for (const path of SENSITIVE_PATHS) {
      expect(isSensitiveFile(path)).toBe(true);
    }
  });

  it('detects sensitive files in nested directories', () => {
    expect(isSensitiveFile('src/background/auth.js')).toBe(true);
    expect(isSensitiveFile('./shared/security/policy.js')).toBe(true);
  });

  it('normalizes windows paths', () => {
    expect(isSensitiveFile('config\\secrets\\prod.json')).toBe(true);
  });

  it('handles leading slashes gracefully', () => {
    expect(isSensitiveFile('/manifest.json')).toBe(true);
  });

  it('allows README and documentation files', () => {
    expect(isSensitiveFile('README.md')).toBe(false);
    expect(isSensitiveFile('docs/security-overview.md')).toBe(false);
  });

  it('allows test files with auth in the name', () => {
    expect(isSensitiveFile('tests/auth.test.js')).toBe(false);
  });

  it('blocks helper files containing secrets', () => {
    expect(isSensitiveFile('src/auth-helper.js')).toBe(true);
    expect(isSensitiveFile('config/api-keys.ts')).toBe(true);
  });

  it('ignores generated build artifacts', () => {
    expect(isSensitiveFile('dist/manifest.json')).toBe(false);
    expect(isSensitiveFile('build/config.js')).toBe(false);
  });

  it('flags dotfile credentials', () => {
    expect(isSensitiveFile('.aws/credentials')).toBe(true);
    expect(isSensitiveFile('.env')).toBe(true);
  });

  it('allows CI workflows referencing auth', () => {
    expect(isSensitiveFile('.github/workflows/auth.yml')).toBe(false);
  });

  it('flags IaC secrets', () => {
    expect(isSensitiveFile('terraform/secrets.tf')).toBe(true);
    expect(isSensitiveFile('k8s/secret.yaml')).toBe(true);
  });

  it('handles case insensitivity', () => {
    expect(isSensitiveFile('Shared/Api-Keys.js')).toBe(true);
    expect(isSensitiveFile('AUTH.js')).toBe(true);
  });

  it('ignores unrelated utility files', () => {
    expect(isSensitiveFile('src/utils/logger.js')).toBe(false);
    expect(isSensitiveFile('popup/styles.css')).toBe(false);
  });

  it('flags secrets directories deeply', () => {
    expect(isSensitiveFile('config/secrets/subdir/credentials.json')).toBe(true);
  });

  it('flags payment integrations by pattern', () => {
    expect(isSensitiveFile('services/payment.js')).toBe(true);
    expect(isSensitiveFile('modules/stripe.js')).toBe(true);
  });
});
