# Benchmark 实施计划

## 目标

为 GC-DOC-MCP 建立三层测试体系，量化 MCP Server 的协议合规性、检索质量和 agent 辅助效果。

---

## 产出物

```
benchmark/
├── package.json                    # 独立 npm 项目
├── tsconfig.json
├── .env.example                    # API keys 模板
├── promptfooconfig.yaml            # promptfoo 主配置
├── PLAN.md                         # 本文档副本（benchmark 内可独立阅读）
├── protocol/                       # Layer 0: 协议合规测试
│   ├── mcp-client.test.ts          # MCP SDK Client 集成测试
│   └── response-schema.test.ts     # 响应结构 zod 校验
├── retrieval/                      # Layer 1: 检索质量测试
│   ├── datasets/                   # 测试数据集
│   │   ├── spreadjs.yaml           # SpreadJS 问答对
│   │   ├── gcexcel.yaml            # GcExcel 问答对
│   │   ├── forguncy.yaml           # Forguncy 问答对
│   │   └── wyn.yaml                # Wyn 问答对
│   └── assertions/                 # 自定义断言脚本
│       └── relevance.js            # 相关性评判逻辑
├── agent-e2e/                      # Layer 2: Agent 端到端（仅方案设计，暂不实现）
│   └── README.md                   # 方案设计文档
└── results/                        # 运行结果（gitignore）
```

---

## Layer 0: 协议合规 + 响应结构测试

**框架**: vitest（复用主项目已有依赖）
**运行方式**: `npm test` in benchmark/
**前置条件**: MCP Server 已启动（本地 `http://localhost:8902`）

### 0.1 MCP 协议合规测试 (`protocol/mcp-client.test.ts`)

用 `@modelcontextprotocol/sdk` 的 Client SDK 通过 Streamable HTTP 连接 server，验证：

| 测试项 | 断言 |
|--------|------|
| initialize 握手 | 返回 serverInfo（name, version）+ capabilities |
| tools/list | 返回 3 个 tool：search, fetch, get_code_guidelines |
| tool schema 校验 | 每个 tool 的 inputSchema 符合预期（query: string, limit: number 等） |
| resources/list | 返回当前产品配置的 resources（cdn_scripts, npm_packages） |
| session 管理 | 首次请求返回 mcp-session-id header；后续请求带此 header 可复用 |
| session 过期 | 发送已失效 session ID → 返回 404 + 错误信息 |
| 非法请求 | 无 session ID + 非 initialize 请求 → 返回 400 |

测试目标：确保 server 严格遵循 MCP 协议，任何合规 client 都能正常交互。

### 0.2 搜索响应结构测试 (`protocol/response-schema.test.ts`)

直接调用 `tools/call` 执行 search tool，用 zod schema 校验返回结构：

```typescript
// 期望的 SearchResponse 结构
const SearchResponseSchema = z.object({
  query: z.string(),
  results: z.array(z.object({
    rank: z.number().int().positive(),
    doc_id: z.string().min(1),
    chunk_id: z.string().min(1),
    score: z.number().min(0).max(1),
    content: z.string().min(1),
    content_preview: z.string(),
    metadata: z.object({
      category: z.string(),
      file_name: z.string(),
      path_hierarchy: z.array(z.string()),
    }).passthrough(),
  })),
  search_time_ms: z.number().nonnegative(),
  rerank_used: z.boolean(),
  fusion_mode: z.enum(['rrf', 'dense_only']),
  detected_lang: z.string(),
  doc_language: z.string(),
});
```

| 测试项 | 断言 |
|--------|------|
| search 返回结构 | 符合 SearchResponseSchema |
| results 排序 | rank 从 1 递增，score 递减 |
| metadata 完整性 | 每条结果都有 category、file_name、path_hierarchy |
| limit 参数生效 | 请求 limit=3 → 最多返回 3 条 |
| 空查询处理 | 空字符串 query → 返回错误或空结果（不崩溃） |
| fetch 返回结构 | 调用 fetch tool → 返回 content 数组，每条有 type: "text" |
| get_code_guidelines 返回结构 | 返回 CDN/npm 信息，包含版本号和 URL |

### 0.3 多产品端点测试

对每个已注册产品（spreadjs, gcexcel, forguncy, wyn）分别测试上述用例，确保多产品隔离无交叉污染。

通过 `/health` 端点动态获取产品列表，循环测试。

---

## Layer 1: 检索质量测试

**框架**: promptfoo
**运行方式**: `npx promptfoo eval` in benchmark/
**前置条件**: MCP Server 已启动

### 1.1 promptfoo 配置

```yaml
# promptfooconfig.yaml
description: "GC-DOC-MCP 检索质量评测"

providers:
  # 直接连 MCP Server 的 search tool
  - id: exec
    config:
      # 自定义脚本：调用 MCP search tool，返回结果
      command: "node retrieval/call-search.js {{product}} \"{{prompt}}\""

# 按产品分组的测试数据集
tests: "retrieval/datasets/*.yaml"

# 默认断言
defaultTest:
  assert:
    - type: javascript
      value: "output.results && output.results.length > 0"
```

实际的 provider 脚本 (`retrieval/call-search.js`) 通过 MCP SDK Client 调用 search tool，返回 JSON 结果。promptfoo 对结果执行断言。

### 1.2 测试数据集格式

每个产品一个 YAML 文件：

```yaml
# retrieval/datasets/spreadjs.yaml
- vars:
    product: spreadjs
    prompt: "SpreadJS 如何实现条件格式"
  assert:
    # 结果中必须包含与条件格式相关的文档
    - type: javascript
      value: >
        output.results.some(r =>
          r.content.toLowerCase().includes('conditionalformat') ||
          r.metadata.file_name.includes('conditionalformat')
        )
    # 返回结果数量合理
    - type: javascript
      value: "output.results.length >= 1 && output.results.length <= 10"
    # 首条结果相关性 score 高于阈值
    - type: javascript
      value: "output.results[0].score > 0.5"

- vars:
    product: spreadjs
    prompt: "SpreadJS CDN 引用地址"
  assert:
    - type: javascript
      value: "output.results.some(r => r.content.includes('cdn.grapecity.com.cn'))"
```

### 1.3 问题生成策略

**冷启动阶段（先做）：** 手工 + AI 辅助生成 10-15 个/产品

问题来源优先级：
1. **产品 YAML 的 instructions 字段** — 里面已列出"常用搜索查询"，直接用
2. **版本敏感型** — CDN URL 是否正确、npm scope 是否正确、版本号是否匹配
3. **负面测试** — 查询不存在的功能、错别字、英文查中文文档

| 问题类型 | 示例 | 断言重点 |
|----------|------|---------|
| 精确查询 | "SpreadJS 条件格式" | 首条结果包含 conditionalFormat |
| 版本敏感 | "SpreadJS CDN 19.0.0" | 结果包含正确版本号 |
| 跨概念组合 | "SpreadJS 数据透视表导出PDF" | 结果覆盖 pivot + pdf |
| 语言检测 | "how to use SpreadJS charts" (英文查中文库) | fusion_mode = dense_only |
| 负面测试 | "SpreadJS 视频播放" | 无高分结果或结果不含视频相关 |
| 产品隔离 | 对 spreadjs 端点查 "GcExcel Workbook" | 不应返回 GcExcel 文档 |

**后续阶段：** 接入访问日志，从真实用户 query 中提取高频问题，补充数据集。

### 1.4 量化指标

promptfoo 自动统计：
- **Pass rate**: 每个产品/每种问题类型的通过率
- **Latency**: search_time_ms 分布
- **Result count**: 平均返回条数

自定义指标（在 assertion 脚本中计算）：
- **Top-1 precision**: 首条结果是否命中预期文档
- **MRR (Mean Reciprocal Rank)**: 预期文档在结果中的平均倒数排名
- **Score distribution**: 各结果的 score 分布是否合理

---

## Layer 2: Agent 端到端测试（方案设计，暂不实现）

### 2.1 架构

```
promptfoo (评测编排)
  └─ exec provider
       └─ run-agent-e2e.sh
            ├─ docker run (隔离环境)
            │   ├─ 挂载 PROMPT.md（只读）
            │   ├─ 配置 MCP Server 连接
            │   ├─ 运行 Claude Code CLI / Codex
            │   └─ 产出代码写入 /workspace
            ├─ 复制 /workspace 产出到宿主机
            └─ vitest EVAL.ts (校验产出)
```

### 2.2 Docker 沙箱设计

```dockerfile
# benchmark/agent-e2e/Dockerfile
FROM node:20-slim

# 预装 Claude Code CLI
RUN npm install -g @anthropic/claude-code

WORKDIR /workspace
# 只挂载 eval 脚手架代码（只读）
# PROMPT.md 通过环境变量或挂载注入
# MCP Server URL 通过环境变量注入

# Agent 在容器内执行，文件系统隔离
# 网络仅允许访问 MCP Server + npm registry
```

### 2.3 A/B 实验设计

| 实验 | MCP 配置 | 目的 |
|------|---------|------|
| baseline | 无 MCP，agent 仅靠预训练知识 | 基线 |
| with-mcp | 配置 MCP Server 连接 | 测 MCP 对 agent 的提升 |
| with-agents-md | 注入静态 AGENTS.md（关键 API 摘要） | 对比静态文档 vs 动态检索 |

### 2.4 Eval Fixture 结构

```
benchmark/agent-e2e/evals/
├── spreadjs-001-cdn-setup/
│   ├── PROMPT.md          # "创建一个引用 SpreadJS CDN 的 HTML 页面"
│   ├── EVAL.ts            # 检查 CDN URL 版本号、必需脚本是否齐全
│   ├── package.json       # { "scripts": { "build": "..." } }
│   └── index.html         # 脚手架（空 HTML）
├── spreadjs-002-conditional-format/
│   ├── PROMPT.md          # "用 SpreadJS 实现：A列>100 标红"
│   ├── EVAL.ts            # 检查 conditionalFormat API 调用
│   └── ...
├── forguncy-001-server-command/
│   ├── PROMPT.md          # "写一个 Forguncy ServerCommand 查询数据库"
│   ├── EVAL.ts            # 检查继承关系、DataAccess 使用、参数化 SQL
│   └── ...
```

### 2.5 为什么需要沙箱

| 场景 | 无沙箱的风险 | 沙箱的保障 |
|------|-------------|-----------|
| agent 执行 `npm install` | 污染宿主机 node_modules | 容器内隔离 |
| agent 写错文件路径 | 覆盖宿主机文件 | 写操作限制在 /workspace |
| 多轮测试间状态 | 上轮残留文件影响下轮 | 每轮新容器 |
| benchmark 可复现性 | 依赖宿主机环境差异 | Docker 镜像固定环境 |
| CI 运行 | GitHub Actions runner 被污染 | 容器隔离 |

核心价值不是安全，是**可复现性**。没有沙箱的 benchmark 数据不可信。

### 2.6 无沙箱替代方案（开发调试用）

在开发阶段不想启动 Docker 时：
- 在临时目录 (`/tmp/eval-workspace-{uuid}`) 运行
- 测试结束后删除
- 仅限本地调试，CI 必须用 Docker

---

## 实施步骤

### Step 1: 创建 benchmark/ 目录骨架

- `benchmark/package.json` — 依赖：vitest, @modelcontextprotocol/sdk, promptfoo, zod
- `benchmark/tsconfig.json` — 继承主项目配置
- `.gitignore` 追加 `benchmark/results/`, `benchmark/.env`

### Step 2: 实现 Layer 0 协议测试

1. 编写 MCP Client 测试辅助函数（连接、断开、调用 tool）
2. 实现 `protocol/mcp-client.test.ts`
3. 实现 `protocol/response-schema.test.ts`
4. 验证对 4 个产品端点都能通过

### Step 3: 实现 Layer 1 检索质量测试

1. 编写 `retrieval/call-search.js` — promptfoo exec provider 脚本
2. 为每个产品编写初始数据集（10-15 个问答对/产品）
3. 编写 `promptfooconfig.yaml`
4. 运行 `npx promptfoo eval`，查看结果 `npx promptfoo view`
5. 根据结果调整断言阈值

### Step 4: 记录 Layer 2 方案

1. 编写 `benchmark/agent-e2e/README.md`，包含上述方案设计
2. 不写代码，仅文档

### Step 5: 主项目集成

- 根目录 `package.json` 增加 script：`"benchmark": "cd benchmark && npm test"`, `"benchmark:retrieval": "cd benchmark && npx promptfoo eval"`
- README 增加 benchmark 相关说明

---

## 依赖清单

```json
{
  "devDependencies": {
    "@modelcontextprotocol/sdk": "^1.0.4",
    "vitest": "^2.1.4",
    "zod": "^3.23.8",
    "promptfoo": "^0.120.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3"
  }
}
```

## 运行方式

```bash
# 前置：启动 MCP Server
npm run dev

# Layer 0: 协议测试
cd benchmark && npm test

# Layer 1: 检索质量
cd benchmark && npx promptfoo eval
cd benchmark && npx promptfoo view  # 打开 Web UI 查看结果
```
