# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22
ARG PNPM_VERSION=11.7.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "pnpm@${PNPM_VERSION}"

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=mycharacter-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

FROM dependencies AS builder
ENV NODE_ENV=production
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
COPY . .
RUN test -n "$NEXT_PUBLIC_SUPABASE_URL" \
    && case "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" in sb_publishable_*) true ;; *) echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must start with sb_publishable_" >&2; exit 1 ;; esac \
    && pnpm build

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

FROM mcr.microsoft.com/playwright:v1.61.1-noble AS e2e
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    CI=1
WORKDIR /app
RUN npm install --global "pnpm@${PNPM_VERSION}"
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=mycharacter-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY . .
CMD ["pnpm", "test:e2e"]
