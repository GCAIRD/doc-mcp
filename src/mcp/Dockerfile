# ── Build ──────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# 所有 workspace 的 package.json 都要在，lockfile 校验才能通过。
# 但只装 shared + mcp 的依赖（跳过 embed / benchmark）。
COPY package.json package-lock.json ./
COPY src/shared/package.json ./src/shared/
COPY src/mcp/package.json ./src/mcp/
COPY src/embed/package.json ./src/embed/
COPY benchmark/package.json ./benchmark/

RUN npm ci -w @gc-doc/shared -w @gc-doc/mcp

COPY src/shared/ ./src/shared/
COPY src/mcp/ ./src/mcp/

RUN npm run build -w @gc-doc/shared \
 && npm run build -w @gc-doc/mcp

# ── Runtime ────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/src/mcp/dist/index.js ./server.mjs
COPY products/ ./products/

ENV NODE_ENV=production
ENV PRODUCTS_DIR=/app/products
EXPOSE 8900

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
	CMD wget -q -O- http://localhost:${PORT:-8900}/health || exit 1

CMD ["node", "server.mjs"]
