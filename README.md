# MCS-DOC-MCP

MESCIUS product documentation RAG + MCP service.

## Installation

```bash
# Dev mode (editable source, changes take effect immediately)
pip install -e .

# Production mode (fixed version, copies to site-packages)
pip install .

# Copy and configure environment variables
cp .env.example .env
# Edit .env, fill in VOYAGE_API_KEY
```

## Build Index

Place documents in `raw_data/{project}/` directory, then run:

```bash
# 1. Start qdrant
docker compose up -d qdrant
# 2. Build index
python scripts/embed.py spreadjs
python scripts/embed.py gcexcel
# 3. Start all services
docker compose up -d
```

Other embed commands:

```bash
# Build all projects
python scripts/embed.py

# Rebuild index (clear collection)
python scripts/embed.py spreadjs --recreate

# Start from scratch, don't resume from checkpoint
python scripts/embed.py --restart
```

Supports checkpoint resume. Interrupted runs will auto-recover.

## Service Management

```bash
# Check status
docker compose ps

# View logs
docker compose logs -f

# Stop services
docker compose down
```

## API Endpoints

- `POST /search` - RAG search
- `GET /doc/{doc_id}?project=xxx` - Get full document
- `POST /mcp/{project}` - MCP protocol endpoint
- `GET /health` - Health check

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│ MCP Server  │────▶│ RAG Service │
│  (Claude)   │     │   :8901     │     │   :8900     │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                        ┌──────▼──────┐
                                        │   Qdrant    │
                                        │   :6334     │
                                        └─────────────┘
```

- **MCP Server**: External-facing, handles MCP protocol
- **RAG Service**: Internal service, performs vector search
- **Qdrant**: Vector database, network isolated
