#!/usr/bin/env bash
# Verifies resources from cloudsql.tf
set -euo pipefail
PROJECT="${1:?}" REGION="${2:?}"

echo "Checking Cloud SQL instance 'my-db'..."
STATE=$(gcloud sql instances describe my-db \
  --project="$PROJECT" --format="value(state)" 2>/dev/null)
if [ "$STATE" = "RUNNABLE" ]; then
  echo "  ✓ Instance exists and is RUNNABLE"
else
  echo "  ✗ Instance state: ${STATE:-NOT FOUND}" && exit 1
fi
