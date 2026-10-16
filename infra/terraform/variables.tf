variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "me-west1"
}

variable "db_instance_name" {
  description = "Cloud SQL instance name (shared across all services)"
  type        = string
  default     = "my-db"
}

variable "db_tier" {
  description = "Cloud SQL machine tier"
  type        = string
  default     = "db-f1-micro"
}

# ── Service database passwords ────────────────────────────────────────────────
# Convention: one password variable per service — never share credentials.
# For local dev the default is '12345678'; override via -var-file or Secret Manager in CI.
# Baseline services only: auth-service and gateway-service (Kong session store).

variable "auth_service_db_password" {
  description = "Password for auth-service_user on the auth-service database"
  type        = string
  sensitive   = true
  default     = "12345678"
}

variable "gateway_service_db_password" {
  description = "Password for gateway-service_user on the gateway-service database"
  type        = string
  sensitive   = true
  default     = "12345678"
}

variable "cloudsql_public_ip" {
  description = "Cloud SQL instance public IP (used by the postgresql provider for schema migrations). Set after the instance is provisioned in the project."
  type        = string
  default     = ""
}

variable "dev_runner_cidr" {
  description = "CIDR of the machine running terraform apply — temporarily authorized to reach Cloud SQL directly"
  type        = string
  default     = ""
}

# ── Network perimeter ─────────────────────────────────────────────────────────

variable "enable_public_lb" {
  description = "Provision the public HTTPS load balancers, managed SSL certs, and Cloud DNS zone (Kong + web). Requires a real domain. Leave false to run on Cloud Run *.run.app URLs with no LB cost."
  type        = bool
  default     = false
}

variable "enable_infra_manager" {
  description = "Provision the GCP Infrastructure Manager + Cloud Build auto-apply pipeline (infra-manager.tf). Requires a pre-created Cloud Build GitHub connection + github_repo_uri. Leave false — app deploys use the GitHub Actions workflows."
  type        = bool
  default     = false
}

variable "enable_service_iam" {
  description = "Create Cloud Run IAM invoker bindings (e.g. Kong → auth-service). Enable only AFTER the services are first deployed — the binding targets an existing Cloud Run service, so it 404s on a from-zero apply."
  type        = bool
  default     = false
}

variable "domain_name" {
  description = "Domain for the Kong Gateway managed SSL certificate (e.g. api.yourdomain.com). Only used when enable_public_lb = true."
  type        = string
  default     = ""
}

variable "web_domain" {
  description = "Apex domain for the web frontend load balancer + Cloud DNS zone (e.g. example.com); the cert also covers www.<web_domain>. Only used when enable_public_lb = true."
  type        = string
  default     = ""
}

# ── Infrastructure Manager ──────────────────────────────────────────────────

variable "github_repo_uri" {
  description = "GitHub repository URI for Infrastructure Manager (e.g. https://github.com/owner/repo)"
  type        = string
  default     = ""
}

variable "github_app_installation_id" {
  description = "Cloud Build GitHub App installation ID (2nd gen) — required for IM triggers"
  type        = string
  default     = ""
}
