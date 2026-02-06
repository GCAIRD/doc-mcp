# Multi-stage build for MCS-DOC-MCP

# Stage 1: Builder
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS builder

WORKDIR /app

# Copy dependency files
COPY requirements.txt pyproject.toml ./

# Install dependencies with uv (faster than pip)
ENV UV_HTTP_TIMEOUT=300
RUN uv pip install --system --no-cache -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl && \
	rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY tutorial/dist/ ./tutorial/dist/

# Create non-root user
RUN useradd -m -u 1000 appuser && \
	mkdir -p /app/storage/qdrant /app/storage/checkpoints /app/storage/logs && \
	chown -R appuser:appuser /app

USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
	CMD curl -f http://localhost:8900/health || exit 1

EXPOSE 8900 8901

# Default command (RAG service)
CMD ["python", "scripts/serve.py"]
