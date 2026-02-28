# ── Frontend Build ────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY src/frontend/package.json src/frontend/package-lock.json ./
RUN npm ci

COPY src/frontend/ ./
RUN npm run build

# ── Backend Build ─────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY src/shared/package.json ./src/shared/
COPY src/mcp/package.json ./src/mcp/

RUN npm ci -w @gc-doc/shared -w @gc-doc/mcp

COPY src/shared/ ./src/shared/
COPY src/mcp/ ./src/mcp/

RUN npm run build -w @gc-doc/shared \
 && npm run build -w @gc-doc/mcp

# ── Runtime ───────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/src/mcp/dist/index.js ./server.mjs
COPY --from=frontend-builder /app/frontend/dist ./public/
COPY products/ ./products/

ENV NODE_ENV=production
ENV PRODUCTS_DIR=/app/products
EXPOSE 8900

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
	CMD wget -q -O- http://localhost:${PORT:-8900}/health || exit 1

CMD ["node", "server.mjs"]
