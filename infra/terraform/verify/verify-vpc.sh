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

echo "Checking Cloud Router 'nat-router'..."
gcloud compute routers describe nat-router \
  --region="$REGION" --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ Router exists"

echo "Checking Cloud NAT 'cloud-nat'..."
gcloud compute routers nats describe cloud-nat --router=nat-router \
  --region="$REGION" --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ Cloud NAT exists"

echo "Checking VPC Access Connector 'memorial-site-connector'..."
gcloud compute networks vpc-access connectors describe memorial-site-connector \
  --region="$REGION" --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ VPC Access Connector exists"
