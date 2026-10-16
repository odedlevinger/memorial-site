#!/usr/bin/env bash
# Verifies resources from load-balancer.tf
set -euo pipefail
PROJECT="${1:?}" REGION="${2:?}"

echo "Checking global IP 'kong-gateway-ip'..."
gcloud compute addresses describe kong-gateway-ip \
  --global --project="$PROJECT" --format="value(address)" >/dev/null
echo "  ✓ Global IP exists"

echo "Checking SSL certificate 'kong-gateway-cert'..."
gcloud compute ssl-certificates describe kong-gateway-cert \
  --global --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ SSL certificate exists"

echo "Checking NEG 'kong-gateway-neg'..."
gcloud compute network-endpoint-groups describe kong-gateway-neg \
  --region="$REGION" --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ NEG exists"

echo "Checking backend service 'kong-gateway-backend'..."
gcloud compute backend-services describe kong-gateway-backend \
  --global --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ Backend service exists"

echo "Checking URL map 'kong-url-map'..."
gcloud compute url-maps describe kong-url-map \
  --global --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ URL map exists"

echo "Checking HTTPS proxy 'kong-https-proxy'..."
gcloud compute target-https-proxies describe kong-https-proxy \
  --global --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ HTTPS proxy exists"

echo "Checking forwarding rule 'kong-forwarding-rule'..."
gcloud compute forwarding-rules describe kong-forwarding-rule \
  --global --project="$PROJECT" --format="value(name)" >/dev/null
echo "  ✓ Forwarding rule exists"
