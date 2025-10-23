#!/bin/bash
set -euo pipefail

echo "🔍 Running npm audit (moderate severity or higher)..."
npm audit --audit-level=moderate

echo "🔍 Checking for outdated dependencies..."
npm outdated || true

echo "🔍 Validating lockfile integrity..."
npx lockfile-lint --path package-lock.json --allowed-hosts npm --validate-https

echo "✅ Dependency audit complete"
