#!/usr/bin/env bash
# Verifies resources from gateway-service.tf
set -euo pipefail
PROJECT="${1:?}" REGION="${2:?}"

echo "Checking Cloud SQL database 'gateway-service'..."
gcloud sql databases describe gateway-service --instance=my-db \
  --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ Database exists"

echo "Checking Cloud SQL user 'gateway-service_user'..."
gcloud sql users list --instance=my-db --project="$PROJECT" \
  --format="value(name)" | grep -q "^gateway-service_user$"
echo "  ✓ User exists"
