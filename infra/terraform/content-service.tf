# ── content-service database & user ──────────────────────────────────────────
# Database name : content-service
# User          : content-service_user
# Password var  : var.content_service_db_password  (see variables.tf)
# Schema owner  : content-service itself (TypeORM runs as this user on startup)

resource "google_sql_database" "content_service" {
  name     = "content-service"
  instance = google_sql_database_instance.my_db.name

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [collation, charset]
  }
}

resource "google_sql_user" "content_service_user" {
  name     = "content-service_user"
  instance = google_sql_database_instance.my_db.name
  password = var.content_service_db_password

  lifecycle {
    prevent_destroy = true
  }
}
