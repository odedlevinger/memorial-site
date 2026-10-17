#!/usr/bin/env bash
# Verifies resources from vpc.tf
set -euo pipefail
PROJECT="${1:?}" REGION="${2:?}"

echo "Checking VPC 'memorial-site-vpc'..."
gcloud compute networks describe memorial-site-vpc \
  --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ VPC exists"

echo "Checking subnet 'services'..."
gcloud compute networks subnets describe services \
  --region="$REGION" --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ Subnet exists"
