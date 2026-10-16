# ── GCP Infrastructure Manager — automated Terraform deployments ─────────────
# OPTIONAL — gated behind var.enable_infra_manager (default false).
#
# Wires Cloud Build triggers that run Infrastructure Manager apply (on merge to
# main) / preview (on PR). App deploys are handled by the GitHub Actions
# workflows in .github/workflows, so leave this OFF unless you specifically want
# IM-driven infra auto-apply.
#
# Enabling it ALSO requires (manual, one-time):
#   • a Cloud Build GitHub connection named "memorial-site-github" in var.region
#   • var.github_repo_uri set to the repo URL (e.g. https://github.com/odedlevinger/memorial-site)
#   • var.github_app_installation_id set

# ── Required APIs ────────────────────────────────────────────────────────────

resource "google_project_service" "infra_manager_api" {
  count              = var.enable_infra_manager ? 1 : 0
  service            = "config.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloud_build_api" {
  count              = var.enable_infra_manager ? 1 : 0
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

# ── Deployment Service Account ───────────────────────────────────────────────

resource "google_service_account" "infra_manager" {
  count        = var.enable_infra_manager ? 1 : 0
  account_id   = "infra-manager-sa"
  display_name = "Infrastructure Manager Deployment SA"
  description  = "Used by GCP Infrastructure Manager to apply Terraform configurations"
}

# ── IAM role assignments for the deployment SA ───────────────────────────────

locals {
  infra_manager_roles = [
    "roles/config.agent",                    # Infrastructure Manager agent (required)
    "roles/compute.admin",                   # VPC, subnets, NAT, LB, NEGs, SSL certs, firewall
    "roles/cloudsql.admin",                  # Cloud SQL instances, databases, users
    "roles/iam.serviceAccountAdmin",         # Service accounts
    "roles/iam.serviceAccountUser",          # Act as service accounts
    "roles/run.admin",                       # Cloud Run IAM bindings
    "roles/pubsub.admin",                    # Pub/Sub topics, subscriptions, IAM
    "roles/storage.admin",                   # GCS buckets, IAM
    "roles/dns.admin",                       # DNS zones, record sets
    "roles/artifactregistry.admin",          # Artifact Registry repositories
    "roles/vpcaccess.admin",                 # VPC access connectors
    "roles/servicenetworking.networksAdmin", # Private service connections
    "roles/serviceusage.serviceUsageAdmin",  # Enable/check APIs (google_project_service)
    "roles/resourcemanager.projectIamAdmin", # Project IAM bindings
    "roles/cloudbuild.connectionAdmin",      # Cloud Build repository connections
    "roles/cloudbuild.builds.editor",        # Cloud Build triggers
    "roles/config.admin",                    # IM deployments management
    "roles/secretmanager.admin",             # Secret Manager secrets, versions, IAM
  ]
}

resource "google_project_iam_member" "infra_manager_roles" {
  for_each = var.enable_infra_manager ? toset(local.infra_manager_roles) : toset([])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.infra_manager[0].email}"
}

# ── Cloud Build SA for triggers ──────────────────────────────────────────────

resource "google_service_account" "cloudbuild_im" {
  count        = var.enable_infra_manager ? 1 : 0
  account_id   = "cloudbuild-im-sa"
  display_name = "Cloud Build Infrastructure Manager SA"
  description  = "Used by Cloud Build triggers to invoke Infrastructure Manager"
}

locals {
  cloudbuild_im_roles = [
    "roles/config.admin",           # Manage IM deployments and previews
    "roles/config.agent",           # IM agent
    "roles/logging.logWriter",      # Write build logs
    "roles/iam.serviceAccountUser", # Act as infra-manager-sa
    "roles/storage.objectViewer",   # Read source from GCS
  ]
}

resource "google_project_iam_member" "cloudbuild_im_roles" {
  for_each = var.enable_infra_manager ? toset(local.cloudbuild_im_roles) : toset([])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloudbuild_im[0].email}"
}

# ── Connection IAM for deployment SA ──────────────────────────────────────────
# Cloud Build v2 connections require resource-level IAM (not just project-level)

resource "google_cloudbuildv2_connection_iam_member" "infra_manager_connection_admin" {
  count    = var.enable_infra_manager ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = "memorial-site-github"
  role     = "roles/cloudbuild.connectionAdmin"
  member   = "serviceAccount:${google_service_account.infra_manager[0].email}"
}

# ── Repository link (uses existing GitHub connection) ────────────────────────

resource "google_cloudbuildv2_repository" "repo" {
  count             = var.enable_infra_manager ? 1 : 0
  project           = var.project_id
  location          = var.region
  name              = "memorial-site"
  parent_connection = "projects/${var.project_id}/locations/${var.region}/connections/memorial-site-github"
  remote_uri        = "${var.github_repo_uri}.git"

  depends_on = [google_project_service.cloud_build_api]
}

# ── Cloud Build trigger: merge to main → IM apply ───────────────────────────

resource "google_cloudbuild_trigger" "im_apply" {
  count              = var.enable_infra_manager ? 1 : 0
  project            = var.project_id
  location           = var.region
  name               = "im-apply"
  description        = "Apply Terraform via Infrastructure Manager on merge to main"
  include_build_logs = "INCLUDE_BUILD_LOGS_WITH_STATUS"

  repository_event_config {
    repository = google_cloudbuildv2_repository.repo[0].id
    push {
      branch       = "main"
      invert_regex = false
    }
  }

  build {
    timeout = "1800s"

    step {
      id   = "apply"
      name = "gcr.io/cloud-builders/gcloud"
      args = [
        "infra-manager", "deployments", "apply",
        "projects/${var.project_id}/locations/${var.region}/deployments/memorial-site-deploy",
        "--service-account=${google_service_account.infra_manager[0].id}",
        "--git-source-repo=${var.github_repo_uri}.git",
        "--git-source-directory=infra/terraform",
        "--git-source-ref=main",
        "--tf-version-constraint=1.5.7",
      ]
      env = ["SHORT_SHA=$SHORT_SHA"]
    }
    options {
      logging = "CLOUD_LOGGING_ONLY"
    }
  }

  service_account = google_service_account.cloudbuild_im[0].id
  included_files  = ["infra/terraform/**"]

  depends_on = [
    google_project_service.infra_manager_api,
    google_project_iam_member.cloudbuild_im_roles,
    google_project_iam_member.infra_manager_roles,
  ]
}

# ── Cloud Build trigger: PR → IM preview (plan) ─────────────────────────────

resource "google_cloudbuild_trigger" "im_preview" {
  count              = var.enable_infra_manager ? 1 : 0
  project            = var.project_id
  location           = var.region
  name               = "im-preview"
  description        = "Preview Terraform changes via Infrastructure Manager on PR"
  include_build_logs = "INCLUDE_BUILD_LOGS_WITH_STATUS"

  repository_event_config {
    repository = google_cloudbuildv2_repository.repo[0].id
    pull_request {
      branch          = "main"
      invert_regex    = false
      comment_control = "COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY"
    }
  }

  build {
    timeout = "1800s"

    step {
      id   = "create_preview"
      name = "gcr.io/cloud-builders/gcloud"
      args = [
        "infra-manager", "previews", "create",
        "projects/${var.project_id}/locations/${var.region}/previews/preview-$SHORT_SHA",
        "--deployment=projects/${var.project_id}/locations/${var.region}/deployments/memorial-site-deploy",
        "--service-account=${google_service_account.infra_manager[0].id}",
        "--git-source-repo=${var.github_repo_uri}.git",
        "--git-source-directory=infra/terraform",
        "--git-source-ref=$BRANCH_NAME",
        "--tf-version-constraint=1.5.7",
      ]
      env = ["SHORT_SHA=$SHORT_SHA"]
    }
    options {
      logging = "CLOUD_LOGGING_ONLY"
    }
  }

  service_account = google_service_account.cloudbuild_im[0].id
  included_files  = ["infra/terraform/**"]

  depends_on = [
    google_project_service.infra_manager_api,
    google_project_iam_member.cloudbuild_im_roles,
    google_project_iam_member.infra_manager_roles,
  ]
}
