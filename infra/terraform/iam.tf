# ── Service accounts & invoker bindings ──────────────────────────────────────
# Kong Gateway is the sole public entry point. It uses this service account to
# obtain IAM OIDC tokens for calling internal Cloud Run services.
#
# Flow:
#   Kong GA SA → metadata server → OIDC token (aud=<service-URL>)
#   Kong sets: Authorization: Bearer <token>
#   Cloud Run verifies token before forwarding the request (platform-level)

resource "google_service_account" "kong_gateway" {
  account_id   = "kong-gateway"
  display_name = "Kong Gateway Service Account"
  description  = "Used by kong-gateway Cloud Run service to invoke internal backends via IAM OIDC"
}

# ── roles/run.invoker bindings ─────────────────────────────────────────────────
# Grant Kong's SA permission to invoke each backend service.
# With --no-allow-unauthenticated on the backends, only callers with this
# binding can reach the service — all others get 403 Forbidden.
#
# Baseline: only auth-service exists. The new business domain adds one binding
# per internal Cloud Run service it introduces, following this pattern.

resource "google_cloud_run_service_iam_binding" "auth_service_invoker" {
  count    = var.enable_service_iam ? 1 : 0
  service  = "memorial-site-auth"
  location = var.region
  role     = "roles/run.invoker"

  members = [
    "serviceAccount:${google_service_account.kong_gateway.email}",
    "serviceAccount:${data.google_project.project.number}-compute@developer.gserviceaccount.com",
  ]
}
