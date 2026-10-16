# ── Shared data sources ──────────────────────────────────────────────────────
# Centralised here so every service .tf file can reference them without
# duplicating data blocks.

data "google_project" "project" {}
