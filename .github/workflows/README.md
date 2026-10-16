# Deploy workflows

One workflow per service — each deploys to **Cloud Run** (region `me-west1`, project
`memorial-site`) on every push to `main` that touches that service's paths:

| Workflow | Builds | Cloud Run service |
|---|---|---|
| `deploy-auth-service.yml` | `apps/auth-service/Dockerfile` | `memorial-site-auth` (internal, no public ingress) |
| `deploy-kong-gateway.yml` | `apps/kong-gateway/Dockerfile` | `kong-gateway` (public entry point) |
| `deploy-web.yml` | `apps/web/Dockerfile` | `memorial-site-web` (public SPA) |

Images are pushed to Artifact Registry `me-west1-docker.pkg.dev/memorial-site/memorial-site/<service>:<git-sha>`.
Auth to GCP is **keyless** via Workload Identity Federation (no JSON keys).

## Prerequisites (one-time, GCP side — not done by these workflows)

1. **Workload Identity Federation + deploy SA** — run `infra/setup_identity.sh` (creates the
   `github-pool` / `github-provider` and the `terraform-runner` service account, bound to the
   `odedlevinger/memorial-site` repo). The WIF provider + SA email are referenced in each workflow's `env`.
2. **Grant the deploy SA the roles it needs** (setup_identity.sh only grants `cloudsql.admin`):
   ```
   roles/run.admin            # deploy Cloud Run
   roles/artifactregistry.writer
   roles/iam.serviceAccountUser   # act as the runtime SA
   ```
3. **Provision infra** — `cd infra/terraform && terraform apply` (Artifact Registry repo `memorial-site`,
   Cloud SQL instance `my-db`, networking, IAM bindings, load balancers).
4. **Create Secret Manager secrets** the services reference (DB URLs, JWT/admin secrets, Google
   client id) and grant each runtime SA `roles/secretmanager.secretAccessor`. Then uncomment the
   `--update-secrets` / `--add-cloudsql-instances` lines in the deploy steps.
5. **Repo variable** for the web build: `VITE_GOOGLE_CLIENT_ID` (Settings → Secrets and variables →
   Actions → Variables). It's a public client id, baked into the bundle.

## Notes

- The deploy steps include `TODO`/placeholder runtime config (env vars, secrets, Cloud SQL, the
  Kong service URL) that depends on the resources above — fill those in once infra exists.
- `kong-gateway` allows unauthenticated Cloud Run ingress (it runs its own auth); `memorial-site-auth` is
  `--no-allow-unauthenticated` (only Kong invokes it, per `iam.tf`).
