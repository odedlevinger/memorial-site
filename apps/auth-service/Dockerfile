# Build context: repo root  →  docker build -f apps/auth-service/Dockerfile .
# (The root package-lock.json is required for npm ci in a workspaces monorepo.)

# ── builder ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first — separate layer for cache efficiency.
COPY package.json package-lock.json ./
COPY apps/auth-service/package.json ./apps/auth-service/

# Install only the dependencies needed for this workspace (hoisted to /app/node_modules).
RUN npm ci --workspace=apps/auth-service --include-workspace-root

# Copy service source and config files needed for the build.
COPY apps/auth-service/src/                  ./apps/auth-service/src/
COPY apps/auth-service/tsconfig.json         ./apps/auth-service/tsconfig.json
COPY apps/auth-service/tsconfig.build.json   ./apps/auth-service/tsconfig.build.json
COPY apps/auth-service/nest-cli.json         ./apps/auth-service/nest-cli.json
RUN cd apps/auth-service && npx nest build

# ── runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Non-root user for security.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=builder /app/apps/auth-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "dist/main.js"]
