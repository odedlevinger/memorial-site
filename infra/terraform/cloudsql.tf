# ── Cloud SQL Instance (my-db) ────────────────────────────────────────────────
# One shared PostgreSQL 16 instance; each service owns a dedicated database and user.
# Schema creation / migrations are handled by each service on startup (TypeORM).
#
# Safety policy:
#   - The instance and every database/user have `prevent_destroy = true`.
#   - Terraform will refuse to delete them even if the resource block is removed from config.
#   - To intentionally drop a database or user, temporarily set prevent_destroy = false
#     in a separate commit, apply, then destroy. This forces an explicit, reviewable step.
#
# Adding a new service:
#   1. Create infra/terraform/<service-name>.tf  (copy an existing service file as template)
#   2. Add a password variable to variables.tf
#   3. Mirror the change in docker/init-databases.sql for local dev parity

resource "google_sql_database_instance" "my_db" {
  name             = var.db_instance_name
  database_version = "POSTGRES_15" # actual running version — upgrade separately if needed
  region           = var.region

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL" # switch to REGIONAL for HA in prod
    disk_type         = "PD_HDD" # matches existing instance — change requires recreate

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = false
      start_time                     = "02:00"
    }

    maintenance_window {
      day          = 7   # Sunday
      hour         = 3
      update_track = "stable"
    }

    ip_configuration {
      ipv4_enabled    = true # keep public IP — Cloud SQL Auth Proxy in CI still uses it
      private_network = google_compute_network.main_vpc.id
      # enabled_private_path_for_google_cloud_services allows Cloud Run (via VPC connector)
      # to reach Cloud SQL on its private IP without going through the public interface.
    }
  }

  # GCP-level deletion protection — must be disabled in GCP Console before destroy.
  deletion_protection = true

  lifecycle {
    # Terraform-level guard — prevents accidental destroy via plan/apply as well.
    prevent_destroy = true
    # Ignore GCP-managed fields that drift between reads but don't affect behaviour.
    ignore_changes  = [settings[0].disk_size, maintenance_version]
  }

  depends_on = [google_service_networking_connection.cloudsql_vpc_connection]
}
