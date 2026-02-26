# Multi-stage build: GC-DOC-MCP + Qdrant all-in-one

# ── Stage 1: Build TypeScript ──────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

ARG PRODUCT=spreadjs
ARG DOC_LANG=cn

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY products/ ./products/

RUN npm run build

# ── Stage 2: Copy Qdrant binary ────────────────────────────
FROM qdrant/qdrant:v1.16 AS qdrant

# ── Stage 3: Runtime (Debian-based for Qdrant compatibility) ─
FROM node:20-slim

ARG PRODUCT=spreadjs
ARG DOC_LANG=cn
ENV PRODUCT=${PRODUCT} DOC_LANG=${DOC_LANG} NODE_ENV=production

WORKDIR /app

# Install wget (health checks) + libunwind8 (Qdrant runtime dependency)
RUN apt-get update && apt-get install -y --no-install-recommends wget libunwind8 && rm -rf /var/lib/apt/lists/*

# Copy Qdrant binary and default config
COPY --from=qdrant /qdrant/qdrant /qdrant/qdrant
COPY --from=qdrant /qdrant/config /qdrant/config

# Create storage directories
RUN mkdir -p /qdrant/storage /app/storage

# Node.js production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled output
COPY --from=builder /app/dist ./dist

# Product configs
COPY products/ ./products/

# Frontend static files
COPY frontend/dist ./frontend/dist

# Entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# Ports: MCP server + Qdrant (internal, optionally exposed)
ENV PORT=8900 QDRANT_PORT=6333
EXPOSE ${PORT}

# Health check targets the MCP server
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
	CMD wget -q -O /dev/null http://localhost:${PORT}/health || exit 1

# Persistent storage
VOLUME ["/qdrant/storage"]

ENTRYPOINT ["/docker-entrypoint.sh"]
