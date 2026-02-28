# Deployment Guide

## Services

| Service | Description | Port |
|---------|-------------|------|
| qdrant | Vector database | 6333 (HTTP) |
| mcp | MCP document retrieval service | 8900 |

Both services can run on the same VM or on separate VMs.

## Prerequisites

- Docker & Docker Compose v2+
- Node.js >= 20 (only for embedding, not needed on deployment VMs)
- A Voyage AI API key

---

## 1. Build MCP Image

Run from the **repository root**:

```bash
docker build -f src/mcp/Dockerfile -t gc-doc-mcp:latest .
```

Push to a registry if needed:

```bash
docker tag gc-doc-mcp:latest your-registry/gc-doc-mcp:latest
docker push your-registry/gc-doc-mcp:latest
```

## 2. Configure Environment

Each language has its own `.env` file at `devops/prod/{lang}/mcp/.env`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PRODUCT` | Yes | — | Comma-separated product IDs (e.g. `spreadjs,gcexcel`) |
| `DOC_LANG` | Yes | — | Language variant: `en`, `cn`, `ja` |
| `VOYAGE_API_KEY` | Yes | — | Voyage AI API key |
| `QDRANT_URL` | No | `http://qdrant:6333` | Override when Qdrant is on a separate VM |
| `PORT` | No | `8900` | MCP service listen port |
| `HOST` | No | `0.0.0.0` | MCP service bind address |
| `VOYAGE_EMBED_MODEL` | No | `voyage-code-3` | Voyage embedding model |
| `VOYAGE_RERANK_MODEL` | No | `rerank-2.5` | Voyage rerank model |
| `LOG_LEVEL` | No | `info` | Log level |

## 3. Deployment

All commands below are run from the `devops/prod/` directory.

### 3.1 Single VM (all services)

```bash
docker compose --env-file ./en/mcp/.env up -d
```

### 3.2 Separate VMs

**Qdrant VM:**

```bash
docker compose --env-file ./en/mcp/.env up -d qdrant
```

**MCP VM:**

Set `QDRANT_URL` in `.env` to the Qdrant VM address:

```
QDRANT_URL=http://<qdrant-vm-ip>:6333
```

```bash
docker compose --env-file ./en/mcp/.env up -d mcp
```

### 3.3 Multi-language deployment

Each language deploys independently on its own VM. The only difference is the `.env` file:

```bash
# English
docker compose --env-file ./en/mcp/.env up -d

# Japanese
docker compose --env-file ./jp/mcp/.env up -d
```

Container names are auto-suffixed with `DOC_LANG` (e.g. `gc-doc-mcp-en`, `gc-doc-mcp-jp`).

## 4. Verify

```bash
# Qdrant health
curl http://localhost:6333/healthz

# MCP health (returns registered product list)
curl http://localhost:8900/health
```

## 5. Run Embedding (Index Build)

Embedding runs locally (not inside Docker) and reads the **root `.env`** file (`node --env-file=../../.env` in the embed package script).

Copy `.env.example` to `.env` at the repository root and fill in at least `PRODUCT`, `DOC_LANG`, `VOYAGE_API_KEY`, and `QDRANT_URL`:

```bash
cp .env.example .env
# Edit .env — set QDRANT_URL to point to the target Qdrant instance
```

Then run:

```bash
npm install

# Place raw documents in src/embed/raw_data/{lang}/{product}/{category}/

# Index all products
npm run embed -w @gc-doc/embed

# Index a single product
npm run embed -w @gc-doc/embed -- -p spreadjs

# Force rebuild (drops existing data)
npm run embed -w @gc-doc/embed -- --force
```

## 6. Directory Layout

```
devops/
├── dev/
│   └── docker-compose.yml      # Dev environment (local build + bind mount)
├── prod/
│   ├── docker-compose.yml      # Production template
│   ├── en/
│   │   ├── mcp/.env            # English environment variables
│   │   └── qdrant/config.yaml  # Qdrant config
│   └── jp/
│       ├── mcp/.env            # Japanese environment variables
│       └── qdrant/config.yaml  # Qdrant config
└── DEPLOY.md                   # This document
```
