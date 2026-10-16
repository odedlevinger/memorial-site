# Build context: repo root  →  docker build -f apps/web/Dockerfile .
# (The root package-lock.json is required for npm ci in a workspaces monorepo.)

# ── builder ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first — separate layer for cache efficiency.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/

# Install only the dependencies needed for this workspace.
# --ignore-scripts: nx's post-install hangs on node:20-alpine; the web build needs no install scripts.
RUN npm ci --workspace=apps/web --include-workspace-root --ignore-scripts

# Copy web source + build config and build static assets.
COPY apps/web/src/               ./apps/web/src/
COPY apps/web/public/            ./apps/web/public/
COPY apps/web/index.html         ./apps/web/index.html
COPY apps/web/vite.config.ts     ./apps/web/vite.config.ts
COPY apps/web/tsconfig.json      ./apps/web/tsconfig.json
COPY apps/web/tsconfig.app.json  ./apps/web/tsconfig.app.json
COPY apps/web/tailwind.config.js ./apps/web/tailwind.config.js
COPY apps/web/postcss.config.js  ./apps/web/postcss.config.js

ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_REDIRECT_URI
# 154: per-build identifier read by vite.config.ts and baked into the SW
# cache names so each deploy invalidates the previous build's caches.
ARG BUILD_ID

# Vite reads VITE_* from .env files (not process.env) during build.
RUN printf "VITE_GOOGLE_CLIENT_ID=%s\nVITE_GOOGLE_REDIRECT_URI=%s\n" \
  "$VITE_GOOGLE_CLIENT_ID" "$VITE_GOOGLE_REDIRECT_URI" > apps/web/.env

RUN cd apps/web && BUILD_ID="${BUILD_ID:-}" npx vite build

# ── runner ────────────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy built assets into nginx's default serve directory.
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# nginx config: SPA routing + proxy /api/auth → Kong gateway (via env var).
# The template is processed by the official nginx entrypoint using envsubst.
ENV NGINX_ENVSUBST_VARS="AUTH_SERVICE_URL"
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
