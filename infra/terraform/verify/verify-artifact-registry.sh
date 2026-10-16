#!/usr/bin/env bash
# Verifies resources from artifact-registry.tf
set -euo pipefail
PROJECT="${1:?}" REGION="${2:?}"

echo "Checking Artifact Registry repository 'memorial-site'..."
gcloud artifacts repositories describe memorial-site \
  --project="$PROJECT" --location="$REGION" --format="value(name)" >/dev/null
echo "  ✓ Repository exists"
