# ── VPC Network ───────────────────────────────────────────────────────────────
# Custom VPC isolating all backend services from the public internet.
# Cloud Run services reach Cloud SQL through the built-in Cloud SQL connection
# (--add-cloudsql-instances), so no Serverless VPC Access Connector is needed.
# If a service ever needs private VPC access, use Direct VPC egress (no always-on VMs).
#
# Network topology:
#   subnet 10.10.0.0/24  — Cloud Run services (private_ip_google_access = true)
#   Cloud NAT             — egress-only internet access for services without public IPs
#   Private Service Connection — Cloud SQL reachable at a private RFC-1918 address

resource "google_compute_network" "main_vpc" {
  name                    = "memorial-site-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

# ── Subnet ────────────────────────────────────────────────────────────────────

resource "google_compute_subnetwork" "services" {
  name                     = "services"
  region                   = var.region
  network                  = google_compute_network.main_vpc.id
  ip_cidr_range            = "10.10.0.0/24"
  private_ip_google_access = true # allows reaching Google APIs without a public IP
}

# ── Cloud NAT (egress-only internet access) ───────────────────────────────────

resource "google_compute_router" "nat_router" {
  name    = "nat-router"
  region  = var.region
  network = google_compute_network.main_vpc.id
}

resource "google_compute_router_nat" "cloud_nat" {
  name                               = "cloud-nat"
  router                             = google_compute_router.nat_router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# ── Private Service Connection for Cloud SQL ──────────────────────────────────
# Allocates an internal IP range for Google-managed services (Cloud SQL) to
# peer into the VPC. Required before setting private_network on the SQL instance.

resource "google_compute_global_address" "cloudsql_private_ip_range" {
  name          = "cloudsql-private-ip-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main_vpc.id
}

resource "google_service_networking_connection" "cloudsql_vpc_connection" {
  network                 = google_compute_network.main_vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.cloudsql_private_ip_range.name]
}
