# ── Base: Dependency Layer ────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY src/shared/package.json ./src/shared/
COPY src/frontend/package.json ./src/frontend/
COPY src/mcp/package.json ./src/mcp/

RUN npm ci

# ── Frontend Build ────────────────────────────────────
FROM node:24-alpine AS frontend-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY src/shared/ ./src/shared/
COPY src/frontend/ ./src/frontend/

WORKDIR /app/src/frontend
RUN npm run build -w @gc-doc/shared \
 && npm run build -w @gc-doc/frontend

# ── Backend Build ─────────────────────────────────────
FROM node:24-alpine AS backend-builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./

COPY src/shared/ ./src/shared/
COPY src/mcp/ ./src/mcp/

RUN npm run build -w @gc-doc/shared \
 && npm run build -w @gc-doc/mcp

# ── Runtime ───────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PRODUCTS_DIR=/app/products

USER node

COPY --from=backend-builder --chown=node:node /app/src/mcp/dist/index.js ./server.mjs
COPY --from=frontend-builder --chown=node:node /app/src/frontend/dist ./public/
COPY --chown=node:node products/ ./products/

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:${PORT}/health || exit 1

CMD ["node", "server.mjs"]