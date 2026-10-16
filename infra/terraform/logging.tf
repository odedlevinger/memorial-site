# ── Cloud Logging — cost-control exclusions ───────────────────────────────────
# Cloud Logging bills $0.50/GiB ingested past the 50 GiB free monthly tier.
# These exclusions drop the noisiest, lowest-value log streams BEFORE ingestion
# so they never count against the bill. Errors and warnings are always preserved.
#
# To temporarily restore a stream while debugging, flip `disabled = true` on the
# relevant exclusion, apply, debug, then flip back.

# 1. Drop successful (2xx/3xx) Cloud Run request logs — keep error responses only.
resource "google_logging_project_exclusion" "cloud_run_success_requests" {
  name        = "cloud-run-success-requests"
  description = "Drop 2xx/3xx Cloud Run request logs to save ingestion cost; errors still ingested."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    httpRequest.status>=200
    httpRequest.status<400
    severity<WARNING
  EOT
}

# 2. Drop Cloud Run health-check probes (kubelet, LB, uptime checks).
resource "google_logging_project_exclusion" "cloud_run_health_checks" {
  name        = "cloud-run-health-checks"
  description = "Drop health-check probe logs from Cloud Run."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    (httpRequest.requestUrl=~"/health" OR httpRequest.requestUrl=~"/_ah/" OR httpRequest.userAgent=~"GoogleHC")
    severity<WARNING
  EOT
}

# 3. Drop INFO/DEBUG application logs — keep WARNING and above.
# Forces every service into a "warnings + errors only" log diet without per-service config.
resource "google_logging_project_exclusion" "cloud_run_info_debug" {
  name        = "cloud-run-info-debug"
  description = "Drop INFO/DEBUG application logs from Cloud Run services."
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    severity<WARNING
    NOT httpRequest.status>=400
  EOT
}

# 4. Drop HTTPS Load Balancer success logs (status < 400).
# The Global External HTTPS LB (Kong front door) emits one record per request — drop the happy path.
resource "google_logging_project_exclusion" "https_lb_success" {
  name        = "https-lb-success"
  description = "Drop 2xx/3xx HTTPS LB request logs."
  filter      = <<-EOT
    resource.type="http_load_balancer"
    httpRequest.status>=200
    httpRequest.status<400
  EOT
}

# 5. Drop VPC flow logs (if enabled) — typically the highest-volume source.
resource "google_logging_project_exclusion" "vpc_flow_logs" {
  name        = "vpc-flow-logs"
  description = "Drop VPC flow logs — high volume, rarely consulted."
  filter      = <<-EOT
    logName=~"compute.googleapis.com%2Fvpc_flows"
  EOT
}
