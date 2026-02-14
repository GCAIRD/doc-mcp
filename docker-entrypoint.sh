#!/bin/sh
set -e

echo "[entrypoint] Starting Qdrant..."
cd /qdrant && ./qdrant &

echo "[entrypoint] Waiting for Qdrant on port ${QDRANT_PORT:-6333}..."
for i in $(seq 1 30); do
	if wget -q -O /dev/null "http://localhost:${QDRANT_PORT:-6333}/healthz" 2>/dev/null; then
		echo "[entrypoint] Qdrant ready"
		break
	fi
	if [ "$i" = "30" ]; then
		echo "[entrypoint] ERROR: Qdrant failed to start within 30s"
		exit 1
	fi
	sleep 1
done

echo "[entrypoint] Starting Node.js application..."
cd /app
exec node dist/index.js
