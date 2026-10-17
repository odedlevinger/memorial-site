# ── Keep-warm ping ────────────────────────────────────────────────────────────
# Every Cloud Run service scales to zero when idle. A visitor after a quiet spell
# then waits on a chain of cold starts (web nginx → Kong → content-service →
# Cloud SQL) and can sit on "Loading…". Pinging the public topics endpoint every
# few minutes walks that whole chain and keeps it warm.
#
# Cost: Cloud Scheduler gives 3 free jobs per billing account; each ping is a
# ~0.2s request inside Cloud Run's free tier; 2xx logs are already excluded in
# logging.tf. Far cheaper than min-instances on three services.

resource "google_project_service" "cloud_scheduler_api" {
  service            = "cloudscheduler.googleapis.com"
  disable_on_destroy = false
}

data "google_cloud_run_service" "web" {
  name     = "memorial-site-web"
  location = var.region
}

resource "google_cloud_scheduler_job" "keep_warm" {
  name        = "memorial-site-keep-warm"
  description = "Keep the public read path warm (web → Kong → content-service → DB)."
  region      = var.region
  schedule    = "*/5 * * * *"
  time_zone   = "Etc/UTC"

  attempt_deadline = "60s"

  http_target {
    http_method = "GET"
    uri         = "${data.google_cloud_run_service.web.status[0].url}/api/content/public/topics"
  }

  depends_on = [google_project_service.cloud_scheduler_api]
}
