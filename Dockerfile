# Multi-stage build for MCS-DOC-MCP (single container, Qdrant Cloud)

# Stage 1: Builder
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS builder

WORKDIR /app

# Copy dependency files
COPY requirements.txt pyproject.toml ./

# Install dependencies with uv (faster than pip)
ENV UV_HTTP_TIMEOUT=300
RUN uv pip install --system --no-cache -r requirements.txt

# Pre-download BM25 model to avoid runtime download
RUN python -c "from fastembed import SparseTextEmbedding; SparseTextEmbedding(model_name='Qdrant/bm25')"

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
	rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy pre-downloaded BM25 model cache
COPY --from=builder /tmp/fastembed_cache /tmp/fastembed_cache

# Copy application code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY tutorial/dist/ ./tutorial/dist/

# Create non-root user
RUN useradd -m -u 1000 appuser && \
	mkdir -p /app/storage/logs && \
	chown -R appuser:appuser /app /tmp/fastembed_cache

USER appuser

# Azure App Service uses WEBSITES_PORT; default to 8900
ENV PORT=8900

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
	CMD curl -f http://localhost:${PORT}/health || exit 1

EXPOSE ${PORT}

# Unified service: RAG + MCP in one process
CMD ["sh", "-c", "python scripts/serve.py --mode all --port ${PORT}"]
