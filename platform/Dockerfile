# The api, as a container.
#
# A Dockerfile rather than any one platform's build settings: Render, Railway,
# Fly and a plain VPS all run this unchanged, so the host is a choice we can
# revisit rather than a dependency baked into the repo.
#
# Build context is `platform/` — the api imports @repo/shared from the
# workspace, so the whole workspace has to be present.
#
#   docker build -f platform/Dockerfile -t desc-api platform
#   docker run -p 3000:3000 --env-file platform/apps/api/.env desc-api

FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable

# Manifests first: this layer is cached until a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter api...

FROM node:24-alpine AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

WORKDIR /app/apps/api

# The api is run through tsx rather than compiled: the source is the artefact
# everywhere else (dev, scripts, e2e), and a separate build step is one more
# thing that can differ between what is tested and what is deployed.
EXPOSE 3000
CMD ["pnpm", "start"]
