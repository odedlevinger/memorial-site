# ── Global External HTTPS Load Balancer for Kong Gateway ─────────────────────
# OPTIONAL — gated behind var.enable_public_lb (default false). The baseline runs
# on Cloud Run *.run.app URLs and needs no domain. Enable this only once you have
# a domain (set var.domain_name + var.enable_public_lb=true) to front Kong with a
# managed-SSL custom domain.
#
# Architecture:
#   [Internet] → [Static IP] → [HTTPS Forwarding Rule] → [HTTPS Proxy]
#                              → [URL Map] → [Backend Service]
#                              → [Serverless NEG → kong-gateway Cloud Run]

resource "google_compute_global_address" "kong_gateway_ip" {
  count        = var.enable_public_lb ? 1 : 0
  name         = "kong-gateway-ip"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
  description  = "Sole external IP for the memorial-site platform (Kong Gateway LB)"
}

resource "google_compute_managed_ssl_certificate" "kong_cert" {
  count = var.enable_public_lb ? 1 : 0
  name  = "kong-gateway-cert"

  managed {
    domains = [var.domain_name]
  }
}

resource "google_compute_region_network_endpoint_group" "kong_neg" {
  count                 = var.enable_public_lb ? 1 : 0
  name                  = "kong-gateway-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = "kong-gateway"
  }
}

resource "google_compute_backend_service" "kong_backend" {
  count       = var.enable_public_lb ? 1 : 0
  name        = "kong-gateway-backend"
  protocol    = "HTTPS"
  description = "Backend wrapping the Kong Gateway serverless NEG"

  backend {
    group = google_compute_region_network_endpoint_group.kong_neg[0].id
  }
}

resource "google_compute_url_map" "kong_url_map" {
  count           = var.enable_public_lb ? 1 : 0
  name            = "kong-url-map"
  default_service = google_compute_backend_service.kong_backend[0].id
}

resource "google_compute_target_https_proxy" "kong_https_proxy" {
  count            = var.enable_public_lb ? 1 : 0
  name             = "kong-https-proxy"
  url_map          = google_compute_url_map.kong_url_map[0].id
  ssl_certificates = [google_compute_managed_ssl_certificate.kong_cert[0].id]
}

resource "google_compute_global_forwarding_rule" "kong_forwarding_rule" {
  count                 = var.enable_public_lb ? 1 : 0
  name                  = "kong-forwarding-rule"
  ip_address            = google_compute_global_address.kong_gateway_ip[0].address
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL"
  port_range            = "443"
  target                = google_compute_target_https_proxy.kong_https_proxy[0].id
}
