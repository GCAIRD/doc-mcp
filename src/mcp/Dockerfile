# ── Stage 1: Build ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# MCP 镜像只需要 shared + mcp 两个 workspace。
# 根 package.json 声明了全部 workspace（含 embed、benchmark），
# 直接 npm ci 会因缺少它们的 package.json 而报错。
# 因此这里用 node 缩减 workspaces 后再安装。
COPY package.json package-lock.json ./
COPY src/shared/package.json ./src/shared/
COPY src/mcp/package.json ./src/mcp/

RUN node -e "\
  const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));\
  p.workspaces=['src/shared','src/mcp'];\
  require('fs').writeFileSync('package.json',JSON.stringify(p,null,2));" \
  && npm ci

# Copy source for shared + mcp only
COPY src/shared/ ./src/shared/
COPY src/mcp/ ./src/mcp/

# Build shared first (generates dist/), then mcp (resolves @gc-doc/shared via symlink → dist/)
RUN npx tsc -b src/shared && npx tsc -b src/mcp

# ── Stage 2: Runtime ───────────────────────────────────
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY src/shared/package.json ./src/shared/
COPY src/mcp/package.json ./src/mcp/

RUN node -e "\
  const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));\
  p.workspaces=['src/shared','src/mcp'];\
  require('fs').writeFileSync('package.json',JSON.stringify(p,null,2));" \
  && npm ci --omit=dev

COPY --from=builder /app/src/shared/dist ./src/shared/dist
COPY --from=builder /app/src/mcp/dist ./src/mcp/dist
COPY products/ ./products/

ENV PRODUCTS_DIR=/app/products

EXPOSE 8900

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
	CMD wget -q -O- http://localhost:${PORT:-8900}/health || exit 1

CMD ["node", "src/mcp/dist/index.js"]
