# DOC-MCP

MESCIUS 产品文档 RAG MCP 服务。Qdrant 向量检索 + Voyage AI embedding/rerank，通过 Streamable HTTP 对外暴露 MCP 工具。

支持产品：SpreadJS、GcExcel、Forguncy、Wyn

## 架构

```
┌─────────────┐
│  MCP Client │  (Cherry Studio / Copilot / TRAE / ...)
└──────┬──────┘
       │ HTTP (Streamable HTTP Transport)
┌──────▼──────────────────────────────────┐
│      Docker Compose                     │
│                                         │
│  ┌─ mcp container (:8900) ────────────┐ │
│  │  Express → /mcp/{productId}        │ │
│  │  每个产品独立 MCP Handler + Session │ │
│  └────────────┬───────────────────────┘ │
│               │                         │
│  ┌─ qdrant container (:6333) ─────────┐ │
│  │  spreadjs_en  (dense + BM25)       │ │
│  │  gcexcel_en                        │ │
│  │  forguncy_en                       │ │
│  │  wyn_en                            │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

每个 MCP Handler 提供 3 个 tool：
- `search` — 文档语义搜索（dense + BM25 混合检索 + rerank）
- `fetch` — 按 doc_id 获取完整文档
- `get_code_guidelines` — 获取 CDN/npm 引用信息

## 快速开始

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 VOYAGE_API_KEY

# 启动（开发环境）
cd devops/dev
docker compose up -d
```

## 构建索引

文档放在 `src/embed/raw_data/{lang}/{product}/` 目录下，然后执行：

```bash
# 本地执行（需要 .env 和本地 Qdrant）
npm run embed -w @gc-doc/embed

# 指定产品
npm run embed -w @gc-doc/embed -- --product spreadjs

# 强制重建 collection
npm run embed -w @gc-doc/embed -- --force
```

支持断点续传，中断后重跑自动恢复。

## MCP 端点

每个产品独立端点：

| 产品 | 端点 |
|------|------|
| SpreadJS | `http://{host}:8900/mcp/spreadjs` |
| GcExcel | `http://{host}:8900/mcp/gcexcel` |
| Forguncy | `http://{host}:8900/mcp/forguncy` |
| Wyn | `http://{host}:8900/mcp/wyn` |

健康检查：`GET http://{host}:8900/health`

## 本地开发

```bash
npm install
npm run dev              # tsx watch（MCP 服务）
npm run build            # 编译全部 workspace
npm run typecheck        # 全量类型检查
```

## 项目结构

```
src/
├── shared/              # @gc-doc/shared — 公共包
│   └── src/
│       ├── config/      # YAML 配置加载 + Zod env 校验
│       ├── embedder.ts  # Voyage AI embedding
│       ├── qdrant-client.ts  # Qdrant SDK 封装
│       ├── logger.ts    # 日志
│       ├── errors.ts    # 错误类型
│       └── rate-limiter.ts
├── embed/               # @gc-doc/embed — 索引构建
│   └── src/
│       ├── index.ts     # CLI 入口
│       ├── indexer.ts   # 批量索引 + checkpoint
│       └── document/    # 文档加载 + 分块策略
├── mcp/                 # @gc-doc/mcp — MCP 服务
│   └── src/
│       ├── index.ts     # 应用入口
│       ├── http.ts      # Express + session 管理
│       ├── protocol/    # MCP server + tools
│       └── rag/         # searcher + language detect
products/                # 产品配置 (product.yaml + {lang}.yaml)
devops/
├── dev/                 # 开发环境 docker-compose
└── prod/                # 生产环境 docker-compose
```

## 添加新产品

1. 创建 `products/{productId}/product.yaml` + `{lang}.yaml`
2. 原始文档放入 `src/embed/raw_data/{lang}/{productId}/{category}/`
3. 环境变量 `PRODUCT` 中追加产品 ID
4. 执行索引

## 环境变量

| 变量 | 说明 |
|------|------|
| `PRODUCT` | 逗号分隔的产品 ID（spreadjs,gcexcel,...） |
| `DOC_LANG` | 语言变体（en/cn/ja） |
| `VOYAGE_API_KEY` | Voyage AI API 密钥 |

其余可选变量见 `.env.example`。
