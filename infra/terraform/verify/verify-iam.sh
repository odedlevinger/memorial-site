#!/usr/bin/env bash
# Verifies resources from iam.tf
set -euo pipefail
PROJECT="${1:?}" REGION="${2:?}"

echo "Checking service account 'kong-gateway'..."
gcloud iam service-accounts describe "kong-gateway@${PROJECT}.iam.gserviceaccount.com" \
  --project="$PROJECT" --format="value(email)" >/dev/null
echo "  ✓ kong-gateway SA exists"

echo "Checking Cloud Run invoker binding on 'memorial-site-auth'..."
gcloud run services get-iam-policy memorial-site-auth \
  --region="$REGION" --project="$PROJECT" --format=json 2>/dev/null \
  | grep -q "roles/run.invoker"
echo "  ✓ auth-service invoker binding exists"
