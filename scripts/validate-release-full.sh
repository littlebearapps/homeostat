#!/bin/bash
set -euo pipefail

printf '🚀 Homeostat Release Validation (Full Suite)\n==============================================\n\n'

mkdir -p release/evidence

./scripts/validate-release.sh
./scripts/validate-coverage.sh
./scripts/validate-slos.sh
./scripts/validate-security.sh

node scripts/generate-release-report.js

echo
echo "📄 Release Evidence Report: release/RELEASE-EVIDENCE.md"
