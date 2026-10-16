# Variables - Update these!
PROJECT_ID="memorial-site-oded"
GITHUB_REPO="odedlevinger/memorial-site"
POOL_ID="github-pool"
PROVIDER_ID="github-provider"
SERVICE_ACCOUNT_NAME="terraform-runner"

# 1. Enable required APIs
gcloud services enable iamcredentials.googleapis.com --project "${PROJECT_ID}"

# 2. Create a Service Account for Terraform
gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --display-name="Terraform GitHub Runner"

# 3. Create the Workload Identity Pool
gcloud iam workload-identity-pools create "${POOL_ID}" \
    --location="global" --display-name="GitHub Actions Pool"

# 4. Create the Identity Provider for GitHub
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="GitHub Provider" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository == '${GITHUB_REPO}'"

# 5. Allow GitHub to "become" that Service Account
# This limits access ONLY to your specific repository
gcloud iam service-accounts add-iam-policy-binding \
    "${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_REPO}"

# 6. Give the Service Account permissions to manage Cloud SQL
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/cloudsql.admin" 