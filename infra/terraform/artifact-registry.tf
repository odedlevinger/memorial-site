# ── Artifact Registry — Docker repository ─────────────────────────────────────
# Single shared Docker repository for all service images.
# Images are tagged by service: memorial-site/auth-service:<sha>, etc.
#
# Rerunnable: Terraform will not delete or recreate the repository on subsequent applies.

resource "google_artifact_registry_repository" "images" {
  repository_id = "memorial-site"
  format        = "DOCKER"
  location      = var.region
  description   = "Docker images for all memorial-site services"

  # Cost control: prune everything older than 1 day, but always keep the most recent
  # tagged image per package so a service rollback target is always available.
  cleanup_policies {
    id     = "keep-latest-tagged"
    action = "KEEP"
    most_recent_versions {
      keep_count = 1
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "86400s" # 1 day
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}
