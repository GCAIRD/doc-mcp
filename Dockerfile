# Multi-stage build for GC-DOC-MCP v2 (TypeScript)

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for product and language
ARG PRODUCT=spreadjs
ARG DOC_LANG=cn

# Copy package files
COPY package.json package-lock.json tsconfig.json ./

# Install ALL dependencies (devDependencies needed for tsc)
RUN npm ci

# Copy source files
COPY src/ ./src/
COPY products/ ./products/

# Build TypeScript
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

# Use built-in non-root user before installing dependencies (avoid chown overhead)
RUN mkdir -p /app && chown node:node /app
WORKDIR /app
USER node

# Build arguments (persisted for runtime)
ARG PRODUCT=spreadjs
ARG DOC_LANG=cn
ENV PRODUCT=${PRODUCT} DOC_LANG=${DOC_LANG} NODE_ENV=production

# Copy package files and install production-only dependencies (as node user)
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output
COPY --chown=node:node --from=builder /app/dist ./dist

# Copy products configuration
COPY --chown=node:node products/ ./products/

# Port from environment, default 8900
ENV PORT=8900

# Health check using wget (installed in base image)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
	CMD wget -q -O /dev/null http://localhost:${PORT}/health || exit 1

EXPOSE ${PORT}

# Start server
CMD ["node", "dist/index.js"]
