# ── Cloud DNS — public zone + API A record ───────────────────────────────────
# OPTIONAL — gated behind var.enable_public_lb (default false). Only needed when
# fronting Kong with a custom domain.
#
# After enabling + `terraform apply`, delegate the zone to GCP by setting your
# registrar's nameservers to `terraform output dns_nameservers`. The managed SSL
# cert (load-balancer.tf) activates once var.domain_name resolves to the LB IP.

resource "google_dns_managed_zone" "web_zone" {
  count       = var.enable_public_lb ? 1 : 0
  name        = "web-zone"
  dns_name    = "${var.web_domain}."
  description = "Public DNS zone for ${var.web_domain}"
  visibility  = "public"
}

# A record: api.<web_domain> → Kong Gateway external IP
resource "google_dns_record_set" "api_a_record" {
  count        = var.enable_public_lb ? 1 : 0
  name         = "api.${google_dns_managed_zone.web_zone[0].dns_name}"
  managed_zone = google_dns_managed_zone.web_zone[0].name
  type         = "A"
  ttl          = 300

  rrdatas = [google_compute_global_address.kong_gateway_ip[0].address]
}
