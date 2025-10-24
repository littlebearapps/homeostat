/**
 * Per PRIVACY-SECURITY-GUIDE.md lines 366-392: maintain regex patterns that route
 * authentication, secrets, and payment files directly to GPT-5.
 */
const RAW_PATTERNS = [
  /^manifest\.json$/i,
  /(?:^|\/)auth(?:-?helper)?\.(?:js|ts|mjs|cjs)$/i,
  /(?:^|\/)api-keys?\.(?:js|ts|mjs|cjs)$/i,
  /(?:^|\/)oauth\.(?:js|ts|mjs|cjs)$/i,
  /(?:^|\/)encryption\.(?:js|ts|mjs|cjs)$/i,
  /(?:^|\/)payment\.(?:js|ts|mjs|cjs)$/i,
  /(?:^|\/)stripe\.(?:js|ts|mjs|cjs)$/i,
  /(?:^|\/)user-data\.(?:js|ts|mjs|cjs)$/i,
  /^config\/secrets\//i,
  /^shared\/security\//i,
  /(?:^|\/)token-store\.(?:js|ts|mjs|cjs)$/i,
  /(?:^|\/)\.env(?:\.[^/]+)?$/i,
  /(?:^|\/)\.npmrc$/i,
  /(?:^|\/)\.aws\/credentials$/i,
  /(?:^|\/)terraform\/.*\.tf$/i,
  /(?:^|\/)k8s\/.*(?:secret|secrets).*\.ya?ml$/i
];

export const SENSITIVE_PATTERNS = RAW_PATTERNS;

function normalizePath(filePath = '') {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

/**
 * Determine if a file should be treated as sensitive.
 * @param {string} filePath
 * @returns {boolean}
 */
export function isSensitiveFile(filePath) {
  const normalized = normalizePath(filePath);
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export default isSensitiveFile;
