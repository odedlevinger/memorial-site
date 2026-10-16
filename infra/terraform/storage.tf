# ── Cloud Storage — Memory photographs ────────────────────────────────────────
# content-service writes resized derivatives under pictures/<uuid>/. Objects are
# public-read (keys are random UUIDs) so browsers and the mobile app load them
# straight from storage.googleapis.com. See apps/content-service/plan.md.

resource "google_storage_bucket" "photos" {
  name                        = "${var.project_id}-photos"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "inherited"
  force_destroy               = false

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Read one object by its exact URL — but NOT list the bucket (objectViewer would allow
# listing, which would reveal the keys of draft pictures).
resource "google_storage_bucket_iam_member" "photos_public_read" {
  bucket = google_storage_bucket.photos.name
  role   = "roles/storage.legacyObjectReader"
  member = "allUsers"
}

resource "google_storage_bucket_iam_member" "photos_content_service_admin" {
  bucket = google_storage_bucket.photos.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.content_service.email}"
}
