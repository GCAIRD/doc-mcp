# 迁移指南：Azure App Service + Qdrant Cloud

## 架构变更

```
迁移前 (3 容器):
  qdrant (本地)  ←  rag-service  ←  mcp-server (HTTP转发)

迁移后 (1 容器):
  Qdrant Cloud (远程)  ←  mcp-server (RAG + MCP 合并, 直接调用)
```

### 改动清单

| 文件 | 改动 |
|------|------|
| `src/core/config.py` | 新增 `qdrant_api_key` 字段；删除 `rag_service_url` |
| `src/embedding/indexer.py` | `QdrantClient` 初始化支持 `api_key` |
| `src/embedding/searcher.py` | `QdrantClient` 初始化支持 `api_key` |
| `src/api/routes/mcp.py` | search/fetch 从 HTTP 转发改为直接调用 `VoyageSearcher` |
| `src/api/app.py` | 移除 `httpx.AsyncClient` 和 `get_http_client` |
| `scripts/serve.py` | 默认 mode 改为 `all` |
| `Dockerfile` | 单容器构建，预下载 BM25 模型，支持 `PORT` 环境变量 |
| `docker-compose.yml` | 只保留一个 service，删除 qdrant 和 rag-service |
| `.env.example` | 新增 `QDRANT_API_KEY`，删除 `MCP_PORT`/`RAG_SERVICE_URL` |

---

## 第一步：推送 Embedding 到 Qdrant Cloud

迁移后，`embed.py` 直接写入 Qdrant Cloud，无需本地 qdrant。

```bash
# .env 配置
VOYAGE_API_KEY=<your_voyage_key>
QDRANT_URL=https://c9200bbe-caf6-4217-b6e0-4a1bb29dc429.westus2-0.azure.cloud.qdrant.io:6333
QDRANT_API_KEY=<your_qdrant_cloud_key>

# 全量构建（首次）
python scripts/embed.py spreadjs --recreate

# 增量更新（后续）
python scripts/embed.py spreadjs
```

本地运行 `embed.py` 即可，它通过 `qdrant-client` 的 HTTPS + API Key 直连 Qdrant Cloud，无需 Docker。

---

## 第二步：本地测试

```bash
# 构建并启动
docker compose up --build

# 验证
curl http://localhost:8900/health
curl http://localhost:8900/projects
curl -X POST http://localhost:8900/search \
  -H "Content-Type: application/json" \
  -d '{"query":"how to use spreadsheet","project":"spreadjs","limit":3}'
```

MCP 端点在同一端口：`http://localhost:8900/mcp/spreadjs`

---

## 第三步：部署到 Azure App Service

### 3.1 创建 Azure Container Registry (ACR)

```bash
az acr create --name <acr_name> --resource-group <rg> --sku Basic
az acr login --name <acr_name>
```

### 3.2 构建并推送镜像

```bash
docker build -t <acr_name>.azurecr.io/mcs-doc-mcp:latest .
docker push <acr_name>.azurecr.io/mcs-doc-mcp:latest
```

或用 ACR Build（不需要本地 Docker）：
```bash
az acr build --registry <acr_name> --image mcs-doc-mcp:latest .
```

### 3.3 创建 App Service

```bash
az appservice plan create \
  --name mcs-doc-mcp-plan \
  --resource-group <rg> \
  --is-linux \
  --sku B1

az webapp create \
  --name mcs-doc-mcp \
  --resource-group <rg> \
  --plan mcs-doc-mcp-plan \
  --deployment-container-image-name <acr_name>.azurecr.io/mcs-doc-mcp:latest
```

### 3.4 配置环境变量

```bash
az webapp config appsettings set --name mcs-doc-mcp --resource-group <rg> --settings \
  VOYAGE_API_KEY="<your_voyage_key>" \
  QDRANT_URL="https://c9200bbe-caf6-4217-b6e0-4a1bb29dc429.westus2-0.azure.cloud.qdrant.io:6333" \
  QDRANT_API_KEY="<your_qdrant_cloud_key>" \
  DOC_LANGUAGE="en" \
  LOG_LEVEL="INFO" \
  LOG_FORMAT="json" \
  WEBSITES_PORT="8900"
```

`WEBSITES_PORT` 告诉 Azure 你的容器监听哪个端口。Dockerfile 中的 `PORT` 默认 8900，两者一致即可。

### 3.5 配置 Health Check

Azure Portal → App Service → Monitoring → Health check:
- Path: `/health`
- 该端点返回 HTTP 200 表示健康

### 3.6 启用持续部署（可选）

```bash
az webapp deployment container config \
  --name mcs-doc-mcp \
  --resource-group <rg> \
  --enable-cd true
```

ACR 推送新镜像后自动重新部署。

---

## 第四步：定期重跑 Embedding

推荐通过 CI/CD 流水线定期执行。

### GitHub Actions 示例

```yaml
name: Rebuild Embeddings
on:
  schedule:
    - cron: '0 3 * * 1'  # 每周一凌晨3点
  workflow_dispatch:       # 手动触发

jobs:
  embed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - run: pip install -r requirements.txt

      - run: python scripts/embed.py --recreate
        env:
          VOYAGE_API_KEY: ${{ secrets.VOYAGE_API_KEY }}
          QDRANT_URL: ${{ secrets.QDRANT_URL }}
          QDRANT_API_KEY: ${{ secrets.QDRANT_API_KEY }}
```

直接写入 Qdrant Cloud，不需要本地 qdrant 实例，不需要 snapshot。

---

## 注意事项

1. **BM25 模型缓存**：Dockerfile 在构建阶段预下载了 `Qdrant/bm25` 模型到 `/tmp/fastembed_cache`，容器启动不需要联网下载。

2. **端口**：合并后只有一个端口（默认 8900），search API 和 MCP 端点共用。Azure App Service 通过 `WEBSITES_PORT` 环境变量映射到 443。

3. **启动时间**：`VoyageSearcher` 初始化时会连接 Qdrant Cloud + 加载 BM25 模型，首次启动约需 10-20 秒。Azure App Service 的 `start_period` 设为 15 秒。

4. **Qdrant Cloud 延迟**：搜索请求的 Qdrant 查询延迟从本地 <1ms 变为公网 10-50ms，但 Voyage API 调用（embed + rerank）本身就需要 200-500ms，Qdrant 延迟占比可忽略。

5. **清理**：迁移完成后可以删除 `storage/qdrant/` 目录（本地 qdrant 数据）。
