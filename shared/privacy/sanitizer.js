/**
 * Per PRIVACY-SECURITY-GUIDE.md lines 224-304: sanitize ALL API payloads before
 * sending them to any model. Redaction format updated per user spec to
 * `[REDACTED_<TYPE>]` while maintaining required patterns.
 */
const REDACTION = {
  extensionId: '[REDACTED_EXTENSION_ID]',
  email: '[REDACTED_EMAIL]',
  unicodeEmail: '[REDACTED_EMAIL]',
  apiKey: '[REDACTED_API_KEY]',
  githubToken: '[REDACTED_GITHUB_TOKEN]',
  jwt: '[REDACTED_JWT]',
  oauthToken: '[REDACTED_TOKEN]',
  userPath: '[REDACTED_USER_PATH]',
  windowsUserPath: '[REDACTED_WINDOWS_USER_PATH]',
  ip: '[REDACTED_IP]',
  credentialUrl: '[REDACTED_URL]',
  linearKey: '[REDACTED_LINEAR_KEY]',
  plausibleKey: '[REDACTED_PLAUSIBLE_KEY]',
  dataUri: '[REDACTED_DATA_URI]',
  queryValue: '[REDACTED_QUERY_VALUE]'
};

const EXTENSION_ID_REGEX = /chrome-extension:\/\/[a-z0-9]{32}/gi;
const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UNICODE_EMAIL_REGEX = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu;
const PARTIAL_EMAIL_REGEX = /\b[A-Z0-9._%+-]+@(?=\s|$|[\]\)}])/gi;
const OPENAI_KEY_REGEX = /\bsk-[a-zA-Z0-9]{32,}\b/g;
const STRIPE_KEY_REGEX = /\bsk_(?:live|test)_[a-zA-Z0-9]{16,}\b/g;
const GITHUB_KEY_REGEX = /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})\b/g;
const GOOGLE_KEY_REGEX = /\bAIza[a-zA-Z0-9_-]{35}\b/g;
const AWS_KEY_REGEX = /\bAKIA[0-9A-Z]{16}\b/g;
const JWT_REGEX = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const LINEAR_KEY_REGEX = /\blin_api_[a-zA-Z0-9]{40}\b/g;
const PLAUSIBLE_KEY_REGEX = /\bplausible_[a-zA-Z0-9_-]{10,}\b/g;
const OAUTH_TOKEN_REGEX = /\bxoxb-[A-Za-z0-9-]{24,}\b/g;
const USER_PATH_REGEX = /\/Users\/[^\/]+/g;
const LINUX_HOME_REGEX = /\/home\/[^\/]+/g;
const WINDOWS_PATH_REGEX = /[A-Za-z]:\\\\(?:Users|Documents and Settings)\\\\[^\\]+/g;
const IPV4_REGEX = /\b((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})\b/g;
const IPV6_REGEX = /\b((?:[0-9A-F]{1,4}:){7}[0-9A-F]{1,4}|(?:[0-9A-F]{1,4}:){1,7}:|:(?::[0-9A-F]{1,4}){1,7}|(?:[0-9A-F]{1,4}:){1,6}:[0-9A-F]{1,4})\b/gi;
const URL_WITH_CREDENTIALS_REGEX = /([a-zA-Z+.-]+:\/\/)\S+:\S+@/g;
const QUERY_PARAM_REGEX = /([?&](?:api[_-]?key|token|session|auth|access[_-]?token)=)([^&\s]+)/gi;
const GENERIC_TOKEN_REGEX = /[A-Za-z0-9_-]{40,}/g;
const PRIVATE_KEY_BLOCK_REGEX = /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g;
const PRIVATE_KEY_HEADER_REGEX = /-----BEGIN [A-Z ]+-----/g;
const PRIVATE_KEY_FOOTER_REGEX = /-----END [A-Z ]+-----/g;
const DATA_URI_REGEX = /data:[\w-]+\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/gi;
const RTL_OVERRIDE_REGEX = /\u202E/g;

/**
 * Calculate Shannon entropy as described in PRIVACY-SECURITY-GUIDE.md lines 263-267.
 * @param {string} value
 * @returns {number}
 */
export function calculateEntropy(value) {
  if (!value) return 0;
  const frequency = new Map();
  for (const char of value) {
    frequency.set(char, (frequency.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  const length = value.length;
  for (const count of frequency.values()) {
    const probability = count / length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

function replaceHighEntropyTokens(value) {
  return value.replace(GENERIC_TOKEN_REGEX, (match) => {
    const entropy = calculateEntropy(match);
    return entropy > 4.5 ? REDACTION.oauthToken : match;
  });
}

function redactUrlsWithCredentials(value) {
  return value.replace(URL_WITH_CREDENTIALS_REGEX, (match, protocol) => {
    return `${protocol}${REDACTION.credentialUrl}@`;
  });
}

function redactPrivateKeyBlocks(value) {
  return value.replace(PRIVATE_KEY_BLOCK_REGEX, REDACTION.apiKey);
}

function redactQueryParams(value) {
  return value.replace(QUERY_PARAM_REGEX, (_, prefix) => `${prefix}${REDACTION.queryValue}`);
}

function redactWindowsPaths(value) {
  const normalizeRemainder = (remainder = '') => {
    const normalized = remainder.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments.length ? `/${segments.join('/')}` : '';
  };
  const forwardRegex = /([A-Za-z]:\/(?:Users|Documents and Settings)\/[^\s/]+)((?:\/[^\s/:]+)*)/g;
  const backwardRegex = /([A-Za-z]:\\(?:Users|Documents and Settings)\\[^\\\s]+)((?:\\[^\\\s:]+)*)/g;
  return value
    .replace(forwardRegex, (_, __, remainder) => `${REDACTION.windowsUserPath}${normalizeRemainder(remainder)}`)
    .replace(backwardRegex, (_, __, remainder) => `${REDACTION.windowsUserPath}${normalizeRemainder(remainder ?? '')}`)
    .replace(/[A-Za-z]:[REDACTED_USER_PATH]/g, REDACTION.windowsUserPath)
    .replace(/[A-Za-z]:\/\[REDACTED_USER_PATH]/g, REDACTION.windowsUserPath);
}

function redactIPv6Candidates(value) {
  return value.replace(/[0-9A-Fa-f:]{2,}/g, (candidate) => {
    if (!candidate.includes(':')) return candidate;
    const normalized = candidate.replace(/[^0-9A-Fa-f:]/g, '');
    if (!normalized.includes(':')) return candidate;
    const segments = normalized.split(':').filter(Boolean);
    const hasHexAlpha = /[A-Fa-f]/.test(normalized);
    const hasDoubleColon = normalized.includes('::');
    if (hasHexAlpha && segments.length >= 2) {
      return REDACTION.ip;
    }
    if (hasDoubleColon && segments.length >= 1) {
      return REDACTION.ip;
    }
    if (segments.length >= 3 && normalized.length >= 8) {
      return REDACTION.ip;
    }
    return candidate;
  });
}

/**
 * Sanitize code payload in accordance with PRIVACY-SECURITY-GUIDE.md lines 242-274.
 * @param {string} code
 * @returns {string}
 */
export function sanitizeCode(code = '') {
  let sanitized = code;
  sanitized = redactQueryParams(sanitized);
  sanitized = redactUrlsWithCredentials(sanitized);
  sanitized = redactWindowsPaths(sanitized);
  sanitized = sanitized.replace(EXTENSION_ID_REGEX, REDACTION.extensionId);
  sanitized = sanitized.replace(EMAIL_REGEX, REDACTION.email);
  sanitized = sanitized.replace(UNICODE_EMAIL_REGEX, REDACTION.unicodeEmail);
  sanitized = sanitized.replace(PARTIAL_EMAIL_REGEX, REDACTION.email);
  sanitized = sanitized.replace(OPENAI_KEY_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(STRIPE_KEY_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(AWS_KEY_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(GITHUB_KEY_REGEX, REDACTION.githubToken);
  sanitized = sanitized.replace(GOOGLE_KEY_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(JWT_REGEX, REDACTION.jwt);
  sanitized = sanitized.replace(LINEAR_KEY_REGEX, REDACTION.linearKey);
  sanitized = sanitized.replace(PLAUSIBLE_KEY_REGEX, REDACTION.plausibleKey);
  sanitized = sanitized.replace(OAUTH_TOKEN_REGEX, REDACTION.oauthToken);
  sanitized = sanitized.replace(IPV4_REGEX, REDACTION.ip);
  sanitized = sanitized.replace(IPV6_REGEX, REDACTION.ip);
  sanitized = sanitized.replace(USER_PATH_REGEX, REDACTION.userPath);
  sanitized = sanitized.replace(LINUX_HOME_REGEX, REDACTION.userPath);
  sanitized = sanitized.replace(WINDOWS_PATH_REGEX, REDACTION.windowsUserPath);
  sanitized = redactWindowsPaths(sanitized);
  sanitized = sanitized.replace(DATA_URI_REGEX, REDACTION.dataUri);
  sanitized = sanitized.replace(RTL_OVERRIDE_REGEX, '');
  sanitized = redactPrivateKeyBlocks(sanitized);
  sanitized = sanitized.replace(PRIVATE_KEY_HEADER_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(PRIVATE_KEY_FOOTER_REGEX, REDACTION.apiKey);
  sanitized = redactIPv6Candidates(sanitized);
  sanitized = replaceHighEntropyTokens(sanitized);
  return sanitized;
}

/**
 * Sanitize stack traces for filesystem data per PRIVACY-SECURITY-GUIDE.md lines 276-288.
 * @param {string} stackTrace
 * @returns {string}
 */
export function sanitizeStackTrace(stackTrace = '') {
  let sanitized = stackTrace;
  sanitized = redactQueryParams(sanitized);
  sanitized = redactUrlsWithCredentials(sanitized);
  sanitized = redactWindowsPaths(sanitized);
  sanitized = sanitized.replace(USER_PATH_REGEX, REDACTION.userPath);
  sanitized = sanitized.replace(LINUX_HOME_REGEX, REDACTION.userPath);
  sanitized = sanitized.replace(WINDOWS_PATH_REGEX, REDACTION.windowsUserPath);
  sanitized = redactWindowsPaths(sanitized);
  sanitized = sanitized.replace(EXTENSION_ID_REGEX, REDACTION.extensionId);
  sanitized = sanitized.replace(IPV4_REGEX, REDACTION.ip);
  sanitized = sanitized.replace(IPV6_REGEX, REDACTION.ip);
  sanitized = sanitized.replace(UNICODE_EMAIL_REGEX, REDACTION.unicodeEmail);
  sanitized = sanitized.replace(EMAIL_REGEX, REDACTION.email);
  sanitized = sanitized.replace(PARTIAL_EMAIL_REGEX, REDACTION.email);
  sanitized = sanitized.replace(OPENAI_KEY_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(STRIPE_KEY_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(AWS_KEY_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(GITHUB_KEY_REGEX, REDACTION.githubToken);
  sanitized = sanitized.replace(GOOGLE_KEY_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(JWT_REGEX, REDACTION.jwt);
  sanitized = sanitized.replace(LINEAR_KEY_REGEX, REDACTION.linearKey);
  sanitized = sanitized.replace(PLAUSIBLE_KEY_REGEX, REDACTION.plausibleKey);
  sanitized = sanitized.replace(OAUTH_TOKEN_REGEX, REDACTION.oauthToken);
  sanitized = sanitized.replace(DATA_URI_REGEX, REDACTION.dataUri);
  sanitized = sanitized.replace(RTL_OVERRIDE_REGEX, '');
  sanitized = redactPrivateKeyBlocks(sanitized);
  sanitized = sanitized.replace(PRIVATE_KEY_HEADER_REGEX, REDACTION.apiKey);
  sanitized = sanitized.replace(PRIVATE_KEY_FOOTER_REGEX, REDACTION.apiKey);
  sanitized = redactIPv6Candidates(sanitized);
  sanitized = replaceHighEntropyTokens(sanitized);
  return sanitized;
}

/**
 * sanitizeForAPI enforces the sanitizer gateway mandated in PRIVACY-SECURITY-GUIDE.md
 * lines 224-239 ensuring both code and stack traces are safe for transmission.
 * @param {string} code
 * @param {string} stackTrace
 * @returns {{ code: string, stackTrace: string }}
 */
export async function sanitizeForAPI(code = '', stackTrace = '') {
  return {
    code: sanitizeCode(code),
    stackTrace: sanitizeStackTrace(stackTrace)
  };
}

export default sanitizeForAPI;
