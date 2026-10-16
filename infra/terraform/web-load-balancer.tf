# ── Global External HTTPS Load Balancer for the web frontend ─────────────────
# OPTIONAL — gated behind var.enable_public_lb (default false). The web shell is
# reachable via its Cloud Run *.run.app URL without this. Enable it (with a real
# domain) to serve the SPA over a managed-SSL custom domain.
#
# Architecture:
#   [Internet] → [static IP] → [HTTPS Forwarding Rule] → [HTTPS Proxy]
#                                  → [URL Map] → [Backend Service]
#                                  → [Serverless NEG → memorial-site-web Cloud Run]
#
# NOTE: the cert domains below are placeholders — set them to your real domain
# when you enable this LB.

resource "google_compute_global_address" "web_ip" {
  count        = var.enable_public_lb ? 1 : 0
  name         = "web-ip"
  address_type = "EXTERNAL"
  ip_version   = "IPV4"
  description  = "Public IP for the web frontend LB"
}

resource "google_compute_managed_ssl_certificate" "web_cert" {
  count = var.enable_public_lb ? 1 : 0
  name  = "web-cert"

  managed {
    domains = [
      var.web_domain,
      "www.${var.web_domain}",
    ]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_region_network_endpoint_group" "web_neg" {
  count                 = var.enable_public_lb ? 1 : 0
  name                  = "web-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = "memorial-site-web"
  }
}

resource "google_compute_backend_service" "web_backend" {
  count       = var.enable_public_lb ? 1 : 0
  name        = "web-backend"
  protocol    = "HTTPS"
  description = "Backend wrapping the web serverless NEG"

  backend {
    group = google_compute_region_network_endpoint_group.web_neg[0].id
  }
}

resource "google_compute_url_map" "web_url_map" {
  count           = var.enable_public_lb ? 1 : 0
  name            = "web-url-map"
  default_service = google_compute_backend_service.web_backend[0].id
}

resource "google_compute_target_https_proxy" "web_https_proxy" {
  count            = var.enable_public_lb ? 1 : 0
  name             = "web-https-proxy"
  url_map          = google_compute_url_map.web_url_map[0].id
  ssl_certificates = [google_compute_managed_ssl_certificate.web_cert[0].id]
}

resource "google_compute_global_forwarding_rule" "web_https_forwarding_rule" {
  count                 = var.enable_public_lb ? 1 : 0
  name                  = "web-https-fr"
  ip_address            = google_compute_global_address.web_ip[0].address
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL"
  port_range            = "443"
  target                = google_compute_target_https_proxy.web_https_proxy[0].id
}

# ── HTTP → HTTPS redirect (port 80) ──────────────────────────────────────────

resource "google_compute_url_map" "web_http_redirect" {
  count = var.enable_public_lb ? 1 : 0
  name  = "web-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "web_http_proxy" {
  count   = var.enable_public_lb ? 1 : 0
  name    = "web-http-proxy"
  url_map = google_compute_url_map.web_http_redirect[0].id
}

resource "google_compute_global_forwarding_rule" "web_http_forwarding_rule" {
  count                 = var.enable_public_lb ? 1 : 0
  name                  = "web-http-fr"
  ip_address            = google_compute_global_address.web_ip[0].address
  ip_protocol           = "TCP"
  load_balancing_scheme = "EXTERNAL"
  port_range            = "80"
  target                = google_compute_target_http_proxy.web_http_proxy[0].id
}
