# ── auth-service database & user ─────────────────────────────────────────────
# Database name : auth-service
# User          : auth-service_user
# Password var  : var.auth_service_db_password  (see variables.tf)
# Schema owner  : auth-service itself (TypeORM runs as this user on startup)

resource "google_sql_database" "auth_service" {
  name     = "auth-service"
  instance = google_sql_database_instance.my_db.name

  lifecycle {
    prevent_destroy = true
    # Collation and charset are set once at creation; ignore any drift.
    ignore_changes = [collation, charset]
  }
}

resource "google_sql_user" "auth_service_user" {
  name     = "auth-service_user"
  instance = google_sql_database_instance.my_db.name
  password = var.auth_service_db_password

  lifecycle {
    prevent_destroy = true
  }
}
