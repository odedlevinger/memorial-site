#!/usr/bin/env bash
# Verifies resources from auth-service.tf
set -euo pipefail
PROJECT="${1:?}" REGION="${2:?}"

echo "Checking Cloud SQL database 'auth-service'..."
gcloud sql databases describe auth-service --instance=my-db \
  --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ Database exists"

echo "Checking Cloud SQL user 'auth-service_user'..."
gcloud sql users list --instance=my-db --project="$PROJECT" \
  --format="value(name)" | grep -q "^auth-service_user$"
echo "  ✓ User exists"
