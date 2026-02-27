# ── Stage 1: Build TypeScript ──────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY products/ ./products/

RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY products/ ./products/

EXPOSE 8900

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
	CMD wget -q -O /dev/null http://localhost:${PORT:-8900}/health || exit 1

CMD ["node", "dist/index.js"]
