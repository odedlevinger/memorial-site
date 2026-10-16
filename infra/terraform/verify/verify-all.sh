#!/usr/bin/env bash
# verify-all.sh — Run all post-deploy verification scripts.
#
# Usage: ./verify-all.sh <project_id> <region>
# Exit 0 if all pass, exit 1 on first failure.
#
# Each verify-*.sh script checks that the resources from its corresponding
# .tf file actually exist and are correctly configured in GCP.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT="${1:?Usage: verify-all.sh <project_id> <region>}"
REGION="${2:?Usage: verify-all.sh <project_id> <region>}"

PASS=0
FAIL=0
FAILED_SCRIPTS=()

for script in "$SCRIPT_DIR"/verify-*.sh; do
  [ "$script" = "$SCRIPT_DIR/verify-all.sh" ] && continue
  name="$(basename "$script")"
  echo "── Running $name ──"
  if bash "$script" "$PROJECT" "$REGION"; then
    echo "✅ $name PASSED"
    PASS=$((PASS + 1))
  else
    echo "❌ $name FAILED"
    FAIL=$((FAIL + 1))
    FAILED_SCRIPTS+=("$name")
  fi
  echo ""
done

echo "════════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  echo "Failed scripts:"
  for s in "${FAILED_SCRIPTS[@]}"; do echo "  - $s"; done
  exit 1
fi
echo "All verifications passed."
exit 0
