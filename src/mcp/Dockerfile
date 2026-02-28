# ── Stage 1: Build ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root + package files
COPY package.json package-lock.json ./
COPY src/shared/package.json ./src/shared/
COPY src/mcp/package.json ./src/mcp/

RUN npm ci --workspace=@gc-doc/shared --workspace=@gc-doc/mcp

# Copy source for shared + mcp only
COPY src/shared/ ./src/shared/
COPY src/mcp/ ./src/mcp/

# Build shared first, then mcp (project references)
RUN npm run build -w @gc-doc/shared && npm run build -w @gc-doc/mcp

# ── Stage 2: Runtime ───────────────────────────────────
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY src/shared/package.json ./src/shared/
COPY src/mcp/package.json ./src/mcp/

RUN npm ci --workspace=@gc-doc/shared --workspace=@gc-doc/mcp --omit=dev

COPY --from=builder /app/src/shared/dist ./src/shared/dist
COPY --from=builder /app/src/mcp/dist ./src/mcp/dist
COPY products/ ./products/

ENV PRODUCTS_DIR=/app/products

EXPOSE 8900

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
	CMD wget -q -O- http://localhost:${PORT:-8900}/health || exit 1

CMD ["node", "src/mcp/dist/index.js"]
