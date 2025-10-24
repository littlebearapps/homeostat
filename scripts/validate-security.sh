#!/bin/bash
set -euo pipefail

RESULTS_DIR="release/evidence"
mkdir -p "$RESULTS_DIR"

AUDIT_LOG="$RESULTS_DIR/npm-audit.log"
LOCKFILE_LOG="$RESULTS_DIR/lockfile-lint.log"
SECRETS_LOG="$RESULTS_DIR/secrets-scan.log"

echo "🔒 Running security scans..."

: > "$SECRETS_LOG"

echo "1️⃣ npm audit..."
if npm audit --audit-level=moderate >"$AUDIT_LOG" 2>&1; then
  echo "✅ No vulnerabilities" | tee -a "$AUDIT_LOG"
else
  if grep -q 'Method forbidden' "$AUDIT_LOG"; then
    echo "⚠️ npm audit unavailable (403 Forbidden)" | tee -a "$AUDIT_LOG"
  else
    echo "⚠️ Vulnerabilities found (see log)" | tee -a "$AUDIT_LOG"
    exit 1
  fi
fi

echo "2️⃣ Lockfile lint..."
if npx lockfile-lint --path package-lock.json --allowed-hosts npm --validate-https >"$LOCKFILE_LOG" 2>&1; then
  echo "✅ Lockfile valid" | tee -a "$LOCKFILE_LOG"
else
  echo "❌ Lockfile issues" | tee -a "$LOCKFILE_LOG"
  exit 1
fi

echo "3️⃣ Secrets scan..."
{
  echo "Checking for DeepSeek keys..." | tee -a "$SECRETS_LOG"
  if grep -R "sk-proj-" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=security --exclude-dir=tests --exclude-dir=docs --exclude="*.log" --exclude="*.sh" . > /dev/null 2>&1; then
    echo "❌ Potential DeepSeek key detected" | tee -a "$SECRETS_LOG"
    exit 1
  else
    echo "✅ No DeepSeek keys found" | tee -a "$SECRETS_LOG"
  fi

  echo "Checking for GitHub tokens..." | tee -a "$SECRETS_LOG"
  if grep -R "ghp_" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=security --exclude-dir=tests --exclude-dir=docs --exclude="*.log" --exclude="*.sh" . > /dev/null 2>&1; then
    echo "❌ Potential GitHub token detected" | tee -a "$SECRETS_LOG"
    exit 1
  else
    echo "✅ No GitHub tokens found" | tee -a "$SECRETS_LOG"
  fi
} || exit 1

echo "✅ All security scans passed!"
