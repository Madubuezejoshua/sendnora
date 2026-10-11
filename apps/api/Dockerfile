# syntax=docker/dockerfile:1

# ==============================================================================
# Sendnaro API — production image (Railway-compatible).
#
# Multi-stage build:
#   1. deps    — install the full workspace dependency graph once (cached).
#   2. build   — generate + compile the Prisma-dependent @sendnaro/database
#                package, then bundle apps/api with tsup (see
#                apps/api/tsup.config.ts for what's bundled in vs. left as a
#                real node_modules package and why).
#   3. runtime — copy only what's needed to run: the bundle, node_modules
#                (kept whole — Prisma's query engine binary and argon2's
#                native binary must resolve from real files on disk), and
#                @sendnaro/database's compiled output + Prisma schema.
# ==============================================================================

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run db:generate --workspace=@sendnaro/database
# @sendnaro/database ships a real compiled output (unlike the other
# @sendnaro/* packages) — see apps/api/tsup.config.ts for why, and build
# it before apps/api so the latter's external import resolves at runtime.
RUN npm run build --workspace=@sendnaro/database
RUN npm run build --workspace=@sendnaro/api

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup -S sendnaro && adduser -S sendnaro -G sendnaro

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/database/generated ./packages/database/generated
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --from=build /app/packages/database/prisma ./packages/database/prisma
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

USER sendnaro
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
