# QueryQuery — container image for self-hosting (e.g. Coolify).
FROM node:22-bookworm-slim

# Toolchain in case better-sqlite3 has to compile (a prebuilt is used when available).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# App source, then build the React client.
COPY . .
RUN pnpm build

ENV NODE_ENV=production \
    PORT=3000 \
    PERSIST_DIR=/data \
    QQ_NO_OPEN=1

# All persistent state (db, config, input/) lives here — mount a volume in Coolify.
# Owned by the unprivileged `node` user (uid 1000, built into the base image) so a
# fresh named volume inherits writable perms. NOTE: with a bind mount, ensure the
# host directory is writable by uid 1000.
RUN mkdir -p /data && chown -R node:node /app /data
VOLUME ["/data"]
EXPOSE 3000

# Drop root: the app parses untrusted .eml and unzips archives, so don't run as root.
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
