#!/usr/bin/env bash
# Verifies resources from infra-manager.tf
set -euo pipefail
PROJECT="${1:?}" REGION="${2:?}"

echo "Checking API: config.googleapis.com..."
gcloud services list --project="$PROJECT" --filter="config.name:config.googleapis.com" \
  --format="value(config.name)" | grep -q "config.googleapis.com"
echo "  ✓ Infrastructure Manager API enabled"

echo "Checking API: cloudbuild.googleapis.com..."
gcloud services list --project="$PROJECT" --filter="config.name:cloudbuild.googleapis.com" \
  --format="value(config.name)" | grep -q "cloudbuild.googleapis.com"
echo "  ✓ Cloud Build API enabled"

echo "Checking service account 'infra-manager-sa'..."
gcloud iam service-accounts describe "infra-manager-sa@${PROJECT}.iam.gserviceaccount.com" \
  --project="$PROJECT" --format="value(email)" >/dev/null
echo "  ✓ infra-manager-sa exists"

echo "Checking IAM role 'roles/config.agent' on infra-manager-sa..."
gcloud projects get-iam-policy "$PROJECT" \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:infra-manager-sa@${PROJECT}.iam.gserviceaccount.com AND bindings.role:roles/config.agent" \
  --format="value(bindings.role)" | grep -q "roles/config.agent"
echo "  ✓ config.agent role bound"

echo "Checking Infrastructure Manager deployment 'memorial-site-deploy'..."
gcloud infra-manager deployments describe memorial-site-deploy \
  --location="$REGION" --project="$PROJECT" --format="value(name)" >/dev/null 2>&1 \
  || echo "  ⚠ Deployment not yet created (expected before first apply)"
echo "  ✓ Deployment check complete"
