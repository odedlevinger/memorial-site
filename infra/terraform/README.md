# Infrastructure — Terraform

Manages the shared Cloud SQL instance and per-service databases/users on GCP.

## File layout

| File | Responsibility |
|---|---|
| `providers.tf` | Google provider version + remote state backend |
| `variables.tf` | All input variables (project, region, passwords) |
| `cloudsql.tf` | **Instance only** — `google_sql_database_instance.my_db` |
| `artifact-registry.tf` | Shared Docker repository `memorial-site` (Artifact Registry) |
| `auth-service.tf` | auth-service database + user |
| `gateway-service.tf` | Kong gateway Cloud Run + gateway-service session-store database + user |
| `iam.tf` | Kong gateway service account + Cloud Run invoker bindings |
| `vpc.tf` / `load-balancer.tf` / `web-load-balancer.tf` / `dns.tf` | Network perimeter, Global HTTPS LBs, DNS zone |
| `logging.tf` / `infra-manager.tf` | Log sinks + Infrastructure Manager deployment |
| `keep-warm.tf` | Cloud Scheduler ping (every 5 min) that keeps the public read path out of cold start |
| `outputs.tf` | Connection string + foundation outputs (store secret values in Secret Manager) |
| `terraform.tfvars.example` | Template — copy to `terraform.tfvars` (git-ignored) |

> Baseline services: **auth-service** and **gateway-service** only. The new business
> domain adds one `<service-name>.tf` per service following the convention below.

## Convention: one file per service

**Every service gets its own `<service-name>.tf` file.** Never add service resources to `cloudsql.tf` — that file is for the shared instance only.

When a new backend service is created, add a `<service-name>.tf` file by copying an existing one:

```bash
cp auth-service.tf <service-name>.tf
# then edit the names and variable references inside
```

Each service file MUST contain exactly:
- `google_sql_database.<service_snake>` with `prevent_destroy = true`
- `google_sql_user.<service_snake>_user` with `prevent_destroy = true`

And `variables.tf` MUST have a matching `variable "<service_snake>_db_password"`.

## Safety: databases are never deleted automatically

All database and user resources have `prevent_destroy = true`. Running
`terraform apply` any number of times is safe — it only creates or updates,
never drops a database or user.

To intentionally delete one (requires a deliberate two-step):
1. Set `prevent_destroy = false` on the target resource, open a PR, get it reviewed.
2. After merge: `terraform apply`, then `terraform destroy -target=<resource>`.
3. Restore `prevent_destroy = true` in a follow-up commit.

## First-time setup

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — fill in project_id and strong passwords

terraform init
terraform plan   # review all planned changes before applying
terraform apply
```

## Adding a new service — checklist

- [ ] `infra/terraform/<service-name>.tf` created (copy `auth-service.tf`)
- [ ] `variable "<service_name>_db_password"` added to `variables.tf`
- [ ] Output added to `outputs.tf`
- [ ] `docker/init-databases.sql` updated (local dev parity)
- [ ] `apps/<service-name>/.env.example` created with the correct `DATABASE_URL`
- [ ] Password stored in GCP Secret Manager before deploying to any shared environment

## Per-service GCP Secret Manager entries

Services that need secrets beyond the database URL provision them manually in GCP Secret
Manager (Terraform doesn't manage these — they are referenced by name from each service's
Cloud Run deploy workflow). After creating each secret, grant the Cloud Run service account
`roles/secretmanager.secretAccessor` on it (mirror the pattern used for `auth-service`).

The new business domain documents its own secrets here as it adds services.
