#!/usr/bin/env bash
# Verifies resources from dns.tf
set -euo pipefail
PROJECT="${1:?}" REGION="${2:?}"

echo "Checking DNS managed zone 'web-zone'..."
gcloud dns managed-zones describe web-zone \
  --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ DNS zone exists"

echo "Checking DNS A record for 'api.example.com.'..."
gcloud dns record-sets list --zone=web-zone \
  --project="$PROJECT" --filter="name=api.example.com. AND type=A" \
  --format="value(name)" | grep -q "api.example.com."
echo "  ✓ A record exists"
