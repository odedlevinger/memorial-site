# ── gateway-service database & user ───────────────────────────────────────────
# Database name : gateway-service
# User          : gateway-service_user
# Password var  : var.gateway_service_db_password  (see variables.tf)
#
# Schema ownership:
#   Terraform runs the sessions migration directly via psql (null_resource).
#   The Kong plugin's run_migrations() is kept as a safety net but Terraform is
#   the authoritative source of truth for the production schema.
#
# To apply the schema (run once, or after schema changes):
#   cd infra/terraform
#   terraform apply \
#     -var="dev_runner_cidr=$(curl -s https://checkip.amazonaws.com)/32" \
#     -target=null_resource.gateway_service_schema

resource "google_sql_database" "gateway_service" {
  name     = "gateway-service"
  instance = google_sql_database_instance.my_db.name

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [collation, charset]
  }
}

resource "google_sql_user" "gateway_service_user" {
  name     = "gateway-service_user"
  instance = google_sql_database_instance.my_db.name
  password = var.gateway_service_db_password

  lifecycle {
    prevent_destroy = true
  }
}

# ── Schema migration via psql ─────────────────────────────────────────────────
# Adds the runner IP to Cloud SQL authorized networks, runs the idempotent
# migration SQL as gateway-service_user, then removes the network.
#
# Only triggered when dev_runner_cidr is supplied:
#   terraform apply -var="dev_runner_cidr=$(curl -s https://checkip.amazonaws.com)/32" \
#                   -target=null_resource.gateway_service_schema

resource "null_resource" "gateway_service_schema" {
  count = var.dev_runner_cidr != "" ? 1 : 0

  triggers = {
    migration_hash = try(filemd5("${path.module}/../../apps/kong-gateway/migrations/001_create_sessions.sql"), "file-not-available")
    runner_cidr    = var.dev_runner_cidr
  }

  # 1. Open Cloud SQL to the runner IP.
  provisioner "local-exec" {
    command = <<-EOF
      gcloud sql instances patch ${var.db_instance_name} \
        --authorized-networks="${var.dev_runner_cidr}" \
        --project="${var.project_id}" \
        --quiet
      # Wait for the patch to propagate.
      sleep 10
    EOF
  }

  # 2. Run the idempotent migration SQL (uses Python + psycopg2-binary; no psql required).
  provisioner "local-exec" {
    environment = {
      PGPASSWORD = var.gateway_service_db_password
    }
    command = <<-EOF
      python3 -c "
import psycopg2, os
sql = open('${path.module}/../../apps/kong-gateway/migrations/001_create_sessions.sql').read()
conn = psycopg2.connect(
  host='${var.cloudsql_public_ip}', port=5432,
  dbname='gateway-service', user='gateway-service_user',
  password=os.environ['PGPASSWORD'], sslmode='require'
)
conn.autocommit = False
cur = conn.cursor()
cur.execute(sql)
conn.commit()
print('Migration applied successfully')
cur.close()
conn.close()
"
    EOF
  }

  # 3. Remove the temporary authorized network.
  provisioner "local-exec" {
    command = <<-EOF
      gcloud sql instances patch ${var.db_instance_name} \
        --clear-authorized-networks \
        --project="${var.project_id}" \
        --quiet
    EOF
  }

  depends_on = [
    google_sql_database.gateway_service,
    google_sql_user.gateway_service_user,
  ]
}
