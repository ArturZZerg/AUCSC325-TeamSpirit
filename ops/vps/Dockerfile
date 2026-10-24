# Pin the reviewed Node 22 image. Update only with a rebuilt/accepted release.
FROM node:22-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/contracts ./packages/contracts
COPY packages/domain ./packages/domain
# Optional public CA bundle for development networks with a trusted TLS proxy.
# BuildKit mounts it temporarily; it is never copied into either image.
RUN --mount=type=secret,id=build_ca \
    if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm ci --ignore-scripts --no-audit --workspace=@campusflow/api \
    --workspace=@campusflow/contracts --workspace=@campusflow/domain --include-workspace-root \
    && npm run db:generate && npm run build

# The build target retains the pinned Prisma CLI for one-shot migrations.
FROM build AS production-dependencies
# Restrict only this disposable stage to the runtime workspaces. Selected-workspace
# pruning leaves orphaned mobile/test peers from the monorepo lockfile on disk.
RUN node -e "const fs=require('node:fs'),p=JSON.parse(fs.readFileSync('package.json'));p.workspaces=['apps/api','packages/contracts','packages/domain'];fs.writeFileSync('package.json',JSON.stringify(p));"
# Required Nest peers are direct dependencies; optional CLI/compiler peers are omitted.
RUN --mount=type=secret,id=build_ca \
    if [ -s /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    npm prune --omit=dev --omit=optional --omit=peer --ignore-scripts --no-audit
RUN mkdir -p apps/api/node_modules packages/contracts/node_modules packages/domain/node_modules

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist/src ./apps/api/dist/src
COPY --from=build --chown=node:node /app/apps/api/data ./apps/api/data
COPY --from=production-dependencies --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=production-dependencies --chown=node:node /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=build --chown=node:node /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build --chown=node:node /app/packages/domain/dist ./packages/domain/dist
COPY --from=production-dependencies --chown=node:node /app/packages/domain/node_modules ./packages/domain/node_modules
USER node
CMD ["node", "apps/api/dist/src/main.js"]
