# DOC-MCP

RAG 驱动的 MCP 服务器，为 MESCIUS 产品文档（SpreadJS、GcExcel、Forguncy、Wyn）提供向量检索。双容器架构（Node.js MCP 服务 + Qdrant 向量数据库），通过 Streamable HTTP 协议对外暴露 MCP 工具。

## 技术栈

- TypeScript (ES2022, Node16 模块)，制表符缩进
- npm workspaces monorepo（shared / embed / mcp 三包）
- Express.js HTTP 层
- Qdrant 向量数据库（独立容器）
- Voyage AI 嵌入 + 重排
- MCP SDK (`@modelcontextprotocol/sdk`)
- Zod 校验贯穿全局

## 项目结构

```
├── src/
│   ├── shared/                    # @gc-doc/shared — 公共包
│   │   └── src/
│   │       ├── index.ts           # barrel 导出
│   │       ├── config/
│   │       │   ├── env.ts         # Zod 环境变量校验（PRODUCT, VOYAGE_API_KEY 等）
│   │       │   ├── types.ts       # ProductConfig / VariantConfig / SearchConfig 类型
│   │       │   ├── loader.ts      # YAML 加载器：合并 product.yaml + {lang}.yaml
│   │       │   └── index.ts       # barrel
│   │       ├── embedder.ts        # VoyageEmbedder：动态批次、token 估算、限流、重试
│   │       ├── qdrant-client.ts   # Qdrant SDK 封装：collection 管理、混合/稠密查询、RRF
│   │       ├── logger.ts          # TTY 彩色 / 非 TTY JSON Lines 日志
│   │       ├── errors.ts          # ConfigError / SearchError / ApiError / RateLimitError
│   │       └── rate-limiter.ts    # 滑动窗口 RPM/TPM 限流器
│   ├── embed/                     # @gc-doc/embed — 索引构建 CLI
│   │   ├── raw_data/              # 原始文档（MD），按 {lang}/{product}/{category}/ 组织
│   │   └── src/
│   │       ├── index.ts           # CLI 入口：解析参数→加载配置→分块→索引
│   │       ├── indexer.ts         # RagIndexer：带 checkpoint 的可恢复批量索引
│   │       └── document/
│   │           ├── loader.ts      # DocumentLoader：读取 raw_data/ 下 MD 文件，清洗 HTML
│   │           ├── types.ts       # Document / Chunk / DocChunkMetadata 类型
│   │           ├── chunker.ts     # 工厂：createChunker(type) 按产品选策略
│   │           └── chunkers/
│   │               ├── base.ts    # 抽象基类：header 分割、代码块保护、自然断点查找
│   │               ├── markdown.ts# 通用 Markdown：h2→h3→splitProtected
│   │               ├── typedoc.ts # TypeScript API 文档(SpreadJS)：按 class/member 分块
│   │               └── javadoc.ts # Java API 文档(GcExcel)：按 method 分块
│   └── mcp/                       # @gc-doc/mcp — MCP 服务
│       ├── Dockerfile             # 多阶段构建：build shared+mcp → slim runtime
│       └── src/
│           ├── index.ts           # 应用入口：加载配置→创建 embedder/searcher→启动 HTTP
│           ├── http.ts            # Express 服务：session 管理、多产品 MCP 端点、健康检查
│           ├── request-context.ts # AsyncLocalStorage 请求上下文
│           ├── access-logger.ts   # 访问日志（JSON Lines，始终 stdout）
│           ├── protocol/
│           │   ├── server.ts      # MCPServer：注册 tool/resource，包装 SDK McpServer
│           │   ├── instructions.ts# 动态 system prompt 构建（基础 + 产品特定）
│           │   ├── utils.ts       # textContent 辅助
│           │   └── tools/
│           │       ├── search.ts  # search 工具：调 searcher.search()
│           │       ├── fetch.ts   # fetch 工具：按 doc_id 拉取完整文档所有 chunks
│           │       └── guidelines.ts # get_code_guidelines：返回 CDN/npm 引用信息
│           └── rag/
│               ├── searcher.ts    # RagSearcher：语言检测→混合检索→Voyage 重排
│               ├── language-detect.ts # franc 封装：zho→zh, eng→en 映射
│               └── types.ts       # ISearcher / SearchResponse / SearchResult 接口
├── products/                      # 产品配置（YAML）
│   ├── spreadjs/
│   │   ├── product.yaml           # 产品级：chunker 类型、搜索参数、instructions
│   │   └── en.yaml                # 英文变体：collection 名、raw_data 路径、CDN/npm 资源
│   ├── gcexcel/
│   │   └── product.yaml
│   ├── forguncy/
│   │   └── product.yaml
│   └── wyn/
│       └── product.yaml
├── devops/
│   ├── dev/
│   │   └── docker-compose.yml     # 开发环境：qdrant + mcp（本地构建）
│   └── prod/
│       └── docker-compose.yml     # 生产环境：qdrant + mcp（预构建镜像）
├── qdrant/                        # Qdrant 向量数据库存储（runtime，gitignored）
│   └── database/
├── benchmark/                     # 测试与基准
│   ├── protocol/                  # MCP 协议合规测试（vitest）
│   └── retrieval/                 # 检索质量测试
│       └── datasets/              # 各产品测试查询集（YAML）
├── package.json                   # npm workspaces 根配置
└── tsconfig.json                  # TS project references 根配置
```

## 核心数据流

**索引（@gc-doc/embed）：**
`raw_data/*.md → DocumentLoader → Chunker（按产品策略） → VoyageEmbedder → RagIndexer → Qdrant collection`

**检索（@gc-doc/mcp）：**
`查询 → 语言检测(franc) → Voyage 嵌入 → 同语言:Dense+BM25 RRF / 跨语言:仅Dense → Voyage Rerank → 返回结果`

## MCP 系统设计

### 整体架构（`src/mcp/src/http.ts` + `src/mcp/src/protocol/`）

HTTP 层和 MCP 协议层分离。Express 负责路由和 session 管理，MCP SDK 负责协议序列化。

**多产品端点**：每个产品注册独立路由 `POST /mcp/{productId}`，拥有独立的 session 池。启动时 `src/mcp/src/index.ts` 并行加载所有产品配置和 searcher，传入 `startServer()`。

**Session 生命周期**（`src/mcp/src/http.ts`）：
1. 客户端发 POST（无 `mcp-session-id` header）+ `initialize` JSON-RPC → 创建 `StreamableHTTPServerTransport`，回传 `mcp-session-id`
2. 后续请求携带 `mcp-session-id` → 查 Map 找到 transport → `transport.handleRequest()` 转发
3. 有 session-id 但 Map 中不存在 → 返回 404，客户端须重新 initialize
4. 无 session-id + 非 initialize → 返回 400
5. 30 分钟无活动自动清理（`setInterval` 每 5 分钟扫描）

**每次请求注入 RequestContext**（`src/mcp/src/request-context.ts`）：通过 `AsyncLocalStorage.run()` 将 requestId / sessionId / productId / clientInfo 传递到 MCP tool handler 内部，无需参数穿透。

### MCP Server 封装（`src/mcp/src/protocol/server.ts`）

`MCPServer` 类包装 `@modelcontextprotocol/sdk` 的 `McpServer`。构造时：
- 调用 `buildInstructions(config)`（`src/mcp/src/protocol/instructions.ts`）生成 system prompt，由通用工作流说明 + product.yaml 的 `instructions` 字段拼接
- 注册 3 个 tool：`search` / `fetch` / `get_code_guidelines`，输入用 Zod 校验
- 遍历 `config.variant.resources` 动态注册 MCP resource（CDN scripts、npm packages 等）

每个新 session 会 `new MCPServer()` → `.getServer().connect(transport)`，即每个 session 独享一个 MCPServer 实例。

### MCP Tools（`src/mcp/src/protocol/tools/`）

| Tool | 文件 | 行为 |
|------|------|------|
| `search` | `tools/search.ts` | 接收 query + limit，调 `searcher.search()`，返回 JSON 格式的 SearchResponse |
| `fetch` | `tools/fetch.ts` | 接收 doc_id，调 `searcher.getDocChunks()`，按 chunk_index 排序拼接为完整文档返回 |
| `get_code_guidelines` | `tools/guidelines.ts` | 无参数，直接返回 config.variant.resources 中所有资源内容 |

三个 handler 均通过 `createXxxHandler()` 工厂函数创建，闭包持有 config 和 searcher 引用。Tool 内部通过 `requestContext.getStore()` 获取当前请求上下文做访问日志。

## Chunk 系统设计

### 策略选择（`src/embed/src/document/chunker.ts`）

工厂函数 `createChunker(type, options)` 根据 product.yaml 中的 `chunker` 字段选择实现：
- `markdown` → `MarkdownChunker`（Forguncy、Wyn）
- `typedoc` → `TypeDocChunker`（SpreadJS）
- `javadoc` → `JavaDocChunker`（GcExcel）

### 基类能力（`src/embed/src/document/chunkers/base.ts`）

`BaseChunker` 提供所有分块器共享的底层方法：

- **`splitByHeaders(content, levelPattern)`**：按指定级别的 Markdown header 正则切分
- **`splitProtected(text)`**：代码块感知的智能切分。识别所有 `` ``` `` 围栏位置，仅在非代码区域切分。代码块允许 1.5x `chunkSize` 合并容忍，超过 3x 才强制切分
- **`splitCodeBlock(codeBlock)`**：超大代码块处理。保留 fence 标记，先按空行切 → 退化为按单行切 → 最终硬切（处理 base64 等超长单行）
- **`findBreakPoint(text, maxPos)`**：自然断点查找，优先级：`\n\n` > `\n` > `。` > `.`（排除 URL 内的点）
- **`chunkDocuments(docs)`**：批量处理入口，回填 `total_chunks` 和 `doc_toc` 元数据到每个 chunk
- **`extractToc(content)`**：提取文档所有 Markdown header 生成目录结构字符串

### 三种分块策略

**MarkdownChunker**（`src/embed/src/document/chunkers/markdown.ts`）：
- 小文件（≤ chunkSize）直接输出
- h2 主切 → 仍超限则 h3 二次切 → `splitProtected` 兜底
- 续块前缀父级 header 保持上下文
- 每个 chunk 写入 `section_path` 元数据（如 `["安装", "npm 安装"]`）

**TypeDocChunker**（`src/embed/src/document/chunkers/typedoc.ts`）：
按 `doc.metadata.category` 分三种策略：
- **api**：提取 h1 作为 classHeader → 跳过 TOC 区域（Content/Table of contents/Hierarchy） → 按 h2/h3 切分 class member → 合并相邻小 member → 每个 chunk 前缀 `classHeader + ---`
- **doc**：同 MarkdownChunker 逻辑（h2→h3→splitProtected）
- **demo**：小文件整体输出，大文件走 `splitProtected`，续块补标题 header

**JavaDocChunker**（`src/embed/src/document/chunkers/javadoc.ts`）：
按 `doc.metadata.category` 分三种策略：
- **api**：扫描 header 区域（到 `## Method Summary` 截止） → 定位 `## Method Details` → 按 `### methodName` 正则切分 → 合并相邻 method 直到逼近 chunkSize → 每个 chunk 前缀 class header
- **demo**：同 TypeDocChunker demo 策略
- **doc**：按 h2/h3 切分 + `splitProtected`

### Chunk 元数据

每个 Chunk 携带的 metadata（定义在 `src/embed/src/document/types.ts`）：

| 字段 | 来源 | 用途 |
|------|------|------|
| `relative_path` | 文件路径推导 | 定位原始文档 |
| `category` | 路径中的子目录名（api/doc/demo） | 决定分块策略 |
| `section_path` | chunker 在切分时写入 | 面包屑定位（如 `["Workbook", "Method Details"]`） |
| `doc_toc` | `extractToc()` 生成 | 文档完整目录结构 |
| `total_chunks` | `chunkDocuments()` 回填 | 当前文档总块数 |
| `chunk_index` | 分块时递增 | 块序号，fetch 拼接时排序用 |

## 检索系统设计

### Qdrant Collection Schema（`src/shared/src/qdrant-client.ts`）

每个 collection 包含两种向量：
- **dense**：Cosine 距离，1024 维（voyage-code-3），HNSW 索引（m=16, ef_construct=100）
- **bm25**：Qdrant 原生稀疏向量，IDF 修正。索引时传入原文文本 + model 标识 `Qdrant/bm25`，由 Qdrant 服务端做 tokenize 和 TF-IDF 计算

Point ID 为确定性 UUID：chunk ID 字符串 → MD5 → 格式化为 UUID（`stringToUuid()`）

### 索引流程（`src/embed/src/indexer.ts`）

`RagIndexer.indexChunks()` 流程：
1. 加载 checkpoint → 找到上次成功的 chunk ID → 跳过已索引部分
2. 按 `batchSize` 分批：每批先 `embedder.embedBatch()` 获取 dense 向量
3. 构造 `UpsertPoint`：dense 向量 + BM25 原文文本 + payload（content / doc_id / chunk_index / metadata）
4. 写入 Qdrant（内部再以 32 条为单位分小批 upsert，因为 BM25 payload 体积大）
5. 每批成功后写 checkpoint 到 `storage/`
6. 全部完成后清除 checkpoint 文件

### 检索流程（`src/mcp/src/rag/searcher.ts`）

`RagSearcher.search()` 流程：
1. `detectLanguage(query)` 判断查询语言（franc，min 10 字符）
2. `embedder.embed(query)` 获取 dense 向量
3. 选择检索策略：
   - 查询语言 == 文档语言 → `qdrant.queryHybrid()`：dense + BM25 两路 prefetch → 服务端 RRF 融合（k=60）
   - 查询语言 != 文档语言 → `qdrant.queryDense()`：仅 dense，带 score threshold
4. 可选 Voyage Rerank：`VoyageReranker` 调 `/rerank` API，传入 candidates 原文，按 relevance_score 重排
5. 截取 top K 返回 `SearchResponse`

### Embedding（`src/shared/src/embedder.ts`）

`VoyageEmbedder` 关键设计：
- **动态批次**：按 token 数估算（中文 ÷ 1.5 字符/token，英文 ÷ 2.5），单批不超过 Voyage 60k token（120k 限制留 50% 余量）
- **限流集成**：每批调用前检查 `RateLimiter`（滑动窗口 RPM/TPM），超限等待
- **指数退避重试**：最多 3 次，间隔 1s/2s/4s
- **维度映射**：voyage-code-3 → 1024, voyage-large-2 → 1536 等

## 关键设计决策

- **Monorepo 拆分**：shared（公共原语）/ embed（索引构建）/ mcp（在线服务）三包独立，通过 npm workspaces + TS project references 关联
- **双容器架构**：Qdrant 独立容器，MCP 服务独立容器，通过 docker-compose 编排
- **混合检索策略**：同语言查询用 Dense+BM25 RRF 融合，跨语言退化为仅 Dense（BM25 对不同语言无效）
- **代码块保护**：分块时代码块允许 1.5-3x 超限，避免截断可执行代码
- **Checkpoint 续传**：每批 upsert 成功后写 checkpoint，崩溃后从断点恢复
- **Session TTL**：30 分钟超时，5 分钟扫描清理
- **AsyncLocalStorage**：请求上下文无侵入传递到 MCP tools 层
- **工厂模式**：所有核心组件（chunker/indexer/searcher/embedder）通过工厂函数创建

## 常用命令

```bash
npm run dev              # 开发模式（tsx watch，MCP 服务）
npm run build            # 编译全部 workspace
npm run build:shared     # 仅编译 shared
npm run build:mcp        # 仅编译 mcp
npm run build:embed      # 仅编译 embed
npm run typecheck        # 全量类型检查
npm run test             # vitest
npm run embed -w @gc-doc/embed              # 本地索引
npm run embed -w @gc-doc/embed -- --force   # 强制重建
npm run embed -w @gc-doc/embed -- -p spreadjs  # 仅 spreadjs
```

## 添加新产品

1. 创建 `products/{productId}/product.yaml` + `{lang}.yaml`
2. 原始文档放入 `src/embed/raw_data/{lang}/{productId}/{category}/`
3. 环境变量 `PRODUCT` 中追加产品 ID
4. 执行索引

## 环境变量（必需）

| 变量 | 说明 |
|------|------|
| `PRODUCT` | 逗号分隔的产品 ID（spreadjs,gcexcel,...） |
| `DOC_LANG` | 语言变体（en/cn/ja） |
| `VOYAGE_API_KEY` | Voyage AI API 密钥 |

其余可选变量见 `.env.example` 和 `src/shared/src/config/env.ts`。
