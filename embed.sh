#!/bin/sh
# Embed 必须在容器内执行（Qdrant 运行在容器内部，宿主机无法直接访问）
# 用法:
#   ./embed.sh --force              # 全量重建所有产品
#   ./embed.sh --product spreadjs   # 仅重建 spreadjs
#   ./embed.sh                      # 增量（从 checkpoint 续传）

CONTAINER="gc-doc-mcp-${DOC_LANG:-cn}"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
	echo "ERROR: 容器 ${CONTAINER} 未运行，先 docker compose up -d"
	exit 1
fi

echo ">>> docker exec ${CONTAINER} node dist/embed.js $*"
docker exec "${CONTAINER}" node dist/embed.js "$@"
