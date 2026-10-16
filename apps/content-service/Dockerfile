# Build context: repo root  →  docker build -f apps/content-service/Dockerfile .
# (The root package-lock.json is required for npm ci in a workspaces monorepo.)

# ── builder ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first — separate layer for cache efficiency.
COPY package.json package-lock.json ./
COPY apps/content-service/package.json ./apps/content-service/

# Install only the dependencies needed for this workspace (hoisted to /app/node_modules).
# --ignore-scripts: nx's post-install hangs on node:20-alpine (and nx is not needed in the
# image). sharp ships its linux-musl binaries as plain optional packages — no install step.
RUN npm ci --workspace=apps/content-service --include-workspace-root --ignore-scripts

# Copy service source and config files needed for the build.
COPY apps/content-service/src/                  ./apps/content-service/src/
COPY apps/content-service/tsconfig.json         ./apps/content-service/tsconfig.json
COPY apps/content-service/tsconfig.build.json   ./apps/content-service/tsconfig.build.json
COPY apps/content-service/nest-cli.json         ./apps/content-service/nest-cli.json
RUN cd apps/content-service && npx nest build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Non-root user for security.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder /app/apps/content-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3002
CMD ["node", "dist/main.js"]
