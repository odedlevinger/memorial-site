terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # State is managed by GCP Infrastructure Manager (IM injects its own HTTP backend).
  # DO NOT add a backend block here — it will conflict with IM's injected backend.
  # Local `terraform apply` is NOT allowed; all changes go through IM via merge to main.
}

provider "google" {
  project = var.project_id
  region  = var.region
}
