# ============================================================================
# Stage 1: Build Frontend (Vite + React 19) & Backend (TypeScript -> ESM)
# ============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.server.json vite.config.ts ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

# ============================================================================
# Stage 2: Production Container for МСДИС Subdomain (Node 22 native SQLite)
# ============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NODE_NO_WARNINGS=1 \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data

RUN mkdir -p /app/data/uploads && chown -R node:node /app

COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

USER node

VOLUME ["/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "dist/server/server/index.js"]
