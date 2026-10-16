output "db_instance_connection_name" {
  description = "Cloud SQL connection name — used by Cloud Run via --add-cloudsql-instances"
  value       = google_sql_database_instance.my_db.connection_name
}

output "db_instance_private_ip" {
  description = "Private IP of the Cloud SQL instance (VPC-internal)"
  value       = google_sql_database_instance.my_db.private_ip_address
  sensitive   = true
}

output "auth_service_database_url" {
  description = "DATABASE_URL for auth-service (store in Secret Manager)"
  value       = "postgres://auth-service_user:${var.auth_service_db_password}@/${google_sql_database.auth_service.name}?host=/cloudsql/${google_sql_database_instance.my_db.connection_name}"
  sensitive   = true
}

output "gateway_service_database_url" {
  description = "DATABASE_URL for gateway-service session store (store in Secret Manager)"
  value       = "postgres://gateway-service_user:${var.gateway_service_db_password}@/${google_sql_database.gateway_service.name}?host=/cloudsql/${google_sql_database_instance.my_db.connection_name}"
  sensitive   = true
}

output "kong_gateway_external_ip" {
  description = "Static public IP for the Kong Gateway LB (null unless enable_public_lb = true)"
  value       = one(google_compute_global_address.kong_gateway_ip[*].address)
}

output "dns_nameservers" {
  description = "Cloud DNS nameservers to set at your registrar (null unless enable_public_lb = true)"
  value       = one(google_dns_managed_zone.web_zone[*].name_servers)
}

output "infra_manager_sa_email" {
  description = "Email of the Infrastructure Manager deployment SA (null unless enable_infra_manager = true)"
  value       = one(google_service_account.infra_manager[*].email)
}

output "infra_manager_deployment_id" {
  description = "Infrastructure Manager deployment ID (null unless enable_infra_manager = true)"
  value       = var.enable_infra_manager ? "memorial-site-deploy" : null
}
