# GC-DOC-MCP

GrapeCity 产品文档 RAG + MCP 服务。单容器运行（Node.js + Qdrant），支持多产品同时服务。

支持产品：SpreadJS、GcExcel、Forguncy、Wyn

## 快速开始

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 VOYAGE_API_KEY

# 构建并启动
cd tutorial && npm ci && npm run build && cd ..
docker compose build
docker compose up -d
```

## 构建索引

文档放在 `raw_data/cn/{product}/` 目录下，然后在容器内执行：

```bash
# 索引全部产品（--force 重建 collection）
docker exec gc-doc-mcp-cn node dist/embed.js --force

# 只索引单个产品
docker exec gc-doc-mcp-cn node dist/embed.js --product spreadjs --force

# 增量索引（不加 --force，已有数据保留）
docker exec gc-doc-mcp-cn node dist/embed.js --product wyn
```

支持断点续传，中断后重跑会自动恢复。

## MCP 端点

每个产品独立端点，客户端订阅对应 URL：

| 产品 | 端点 |
|------|------|
| SpreadJS | `http://{host}:8902/mcp/spreadjs` |
| GcExcel | `http://{host}:8902/mcp/gcexcel` |
| Forguncy | `http://{host}:8902/mcp/forguncy` |
| Wyn | `http://{host}:8902/mcp/wyn` |

健康检查：`GET http://{host}:8902/health`

## 架构

```
┌─────────────┐
│  MCP Client │  (Cherry Studio / Copilot / TRAE / ...)
└──────┬──────┘
       │ HTTP (Streamable HTTP Transport)
┌──────▼──────────────────────────────────┐
│         Docker Container                │
│                                         │
│  Express Server (:8902)                 │
│  ├─ /mcp/spreadjs  → MCP Handler       │
│  ├─ /mcp/gcexcel   → MCP Handler       │
│  ├─ /mcp/forguncy  → MCP Handler       │
│  └─ /mcp/wyn       → MCP Handler       │
│                                         │
│  Qdrant (:6333 internal)                │
│  ├─ spreadjs_zh    (dense + BM25)       │
│  ├─ gcexcel_zh                          │
│  ├─ forguncy_zh                         │
│  └─ wyn_zh                              │
└─────────────────────────────────────────┘
```

每个 MCP Handler 提供 3 个 tool：
- `search` — 文档语义搜索（dense + BM25 混合检索 + rerank）
- `fetch` — 按 doc_id 获取完整文档
- `get_code_guidelines` — 获取 CDN/npm 引用信息

## 本地开发

```bash
npm install
npm run dev          # tsx watch 模式
npm run typecheck    # 类型检查
npm run embed        # 本地索引（需要本地 Qdrant）
```

## 目录结构

```
src/
├── index.ts              # 入口
├── embed.ts              # 索引脚本
├── server.ts             # Express + MCP transport
├── config/               # 配置加载 (YAML + env)
├── document/             # 文档加载 + 分块
├── mcp/                  # MCP server + tools
├── rag/                  # Qdrant client + embedder + searcher
└── shared/               # logger, errors, rate-limiter
products/                 # 产品配置 (product.yaml + cn.yaml)
raw_data/cn/              # 源文档 (markdown)
tutorial/                 # 使用教程 (React SPA)
```
