# GC-DOC-MCP v2 架构重构计划

> 综合代码审查专家、架构师、产品经理、MCP 专家四方分析结果
> **最高优先级遵守**：所有重构工作必须严格按照本计划执行

---

## 一、技术栈决策

**选择 TypeScript + 官方 MCP SDK**

| 维度 | 当前 Python | 新方案 TypeScript |
|------|------------|------------------|
| MCP SDK | 手写 JSON-RPC (514行) | `@modelcontextprotocol/sdk` 官方支持 |
| 代码量 | ~600 行 | ~200 行 (-67%) |
| Docker 镜像 | ~1.5-2GB (fastembed/ONNX) | ~80MB (Node alpine) |
| 类型安全 | 部分 mypy，大量 Dict | 完整 TypeScript 类型 |
| 前端工具链 | 分离 (Python + Vite) | 统一 (TS + Vite) |

---

## 二、目录结构

```
gc-doc-mcp/
├── package.json
├── tsconfig.json
├── Dockerfile
├── .github/workflows/build-deploy.yml
│
├── products/                    # 配置驱动核心
│   ├── spreadjs/
│   │   ├── product.yaml    # 产品元信息（语言无关）
│   │   ├── cn.yaml         # 中文版配置
│   │   ├── en.yaml         # 英文版配置
│   │   └── ja.yaml         # 日文版配置
│   ├── gcexcel/
│   ├── wyn/
│   └── forguncy/
│
├── raw_data/                    # 文档原始数据（按 产品/语言 组织）
│   ├── spreadjs/cn/  en/  ja/
│   └── gcexcel/cn/  en/
│
├── src/
│   ├── index.ts               # 入口
│   ├── server.ts              # Express + MCP mount
│   ├── config/
│   │   ├── loader.ts        # 加载 products/ 配置
│   │   ├── types.ts         # ProductConfig, VariantConfig 类型
│   │   └── env.ts           # 环境变量 schema (zod)
│   ├── mcp/
│   │   ├── server.ts        # MCP Server（官方 SDK）
│   │   ├── tools/           # search, fetch, guidelines
│   │   └── instructions.ts   # 动态指令构建
│   ├── rag/
│   │   ├── searcher.ts       # Dense + Sparse 混合搜索
│   │   ├── indexer.ts        # 索引构建
│   │   ├── embedder.ts       # Voyage wrapper
│   │   └── language-detect.ts # 语言检测
│   ├── document/
│   │   ├── loader.ts
│   │   ├── chunker.ts       # Chunker 工厂
│   │   └── chunkers/
│   │       ├── base.ts
│   │       ├── markdown.ts
│   │       └── javadoc.ts
│   └── shared/
│       ├── logger.ts
│       ├── rate-limiter.ts
│       └── errors.ts
│
├── scripts/
│   ├── embed.ts              # CLI: 构建索引
│   └── serve.ts             # CLI: 启动服务
│
└── tutorial/                 # 前端 (保留现有 Vite + Vue)
```

---

## 三、配置系统设计

### 3.1 产品元信息 `products/{product}/product.yaml`

```yaml
id: spreadjs
name: SpreadJS
type: javascript           # js | dotnet | java | platform
chunker: markdown
doc_subdirs: [apis, docs, demos]

search:
  prefetch_limit: 20
  rerank_top_k: 10
  default_limit: 5
```

### 3.2 语言变体配置 `products/{product}/{lang}.yaml`

```yaml
lang: zh                    # zh | en | ja
company: GrapeCity
company_short: GC
doc_language: zh

collection: spreadjs_zh       # {product}_{lang} 命名规范
raw_data: spreadjs/cn

npm_scope: "@grapecity-software"
cdn_domain: cdn.grapecity.com.cn

description: SpreadJS 纯前端表格控件，中文文档

resources:
  cdn_scripts:
    name: SpreadJS CDN 脚本引用
    mimeType: text/html
    content: |
      <!-- 动态生成，避免硬编码版本号 -->
```

### 3.3 运行时配置

```env
PRODUCT=spreadjs
LANG=cn
PORT=8900
```

启动时加载对应配置文件，合并为 `ResolvedConfig`。

---

## 四、Qdrant 存储策略

### 4.1 Collection 命名规范

```
{product}_{lang}
→ spreadjs_zh, spreadjs_en, spreadjs_ja
→ gcexcel_zh, gcexcel_en
→ wyn_zh, wyn_en
```

### 4.2 隔离策略

一个 product × lang = 一个 collection。完全隔离，独立扩缩容。

### 4.3 Payload Schema

```json
{
  "chunk_id": "apis_Workbook_chunk0",
  "doc_id": "apis_Workbook",
  "chunk_index": 0,
  "content": "...",
  "category": "api",
  "file_name": "Workbook",
  "path_hierarchy": ["apis"]
}
```

---

## 五、MCP Server 设计

### 5.1 使用官方 SDK

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { z } from 'zod';

const server = new Server({
  name: `${config.product.name} Documentation Server`,
  version: '2.0.0',
});

// search tool
server.tool(
  'search',
  `Search ${config.variant.description} documentation.`,
  {
    query: z.string().describe('Natural language query'),
    limit: z.number().int().default(5),
  },
  async ({ query, limit }) => {
    const results = await searcher.search(query, limit);
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  }
);

// fetch tool
server.tool('fetch', '...', { doc_id: z.string() }, async ({ doc_id }) => { ... });

// resources (CDN/npm)
server.resource('guidelines://cdn_scripts', '...', async () => ({ ... }));
server.resource('guidelines://npm_packages', '...', async () => ({ ... }));
```

### 5.2 URL 路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | Tutorial 页面 |
| GET | `/playground` | Playground 页面 |
| GET | `/health` | 健康检查 |
| POST | `/mcp` | MCP Streamable HTTP |

**砍掉多产品模式**：不再有 `/mcp/{project}`，每个实例只服务一个产品。

---

## 六、部署设计

### 6.1 构建命令

```bash
# 构建指定产品+语言的镜像
npm run build:image spreadjs cn
# → gc-doc-mcp-spreadjs-cn:latest
```

### 6.2 Docker 镜像

按语言打包：`gc-doc-mcp-{lang}:latest`

### 6.3 部署矩阵优先级

| 优先级 | 产品 | 语言 | collection |
|--------|------|------|-----------|
| P0 | SpreadJS | en/zh | spreadjs_en/spreadjs_zh |
| P1 | GcExcel | en/zh | gcexcel_en/gcexcel_zh |
| P2 | Wijmo | en / Wyn | zh | wijmo_en/wyn_zh |
| P3 | 其他组合 | ... | ... |

---

## 七、重构阶段

### Phase 1: 基础设施 (2-3 天)

- [ ] 项目脚手架：package.json, tsconfig.json, Dockerfile
- [ ] 配置系统：loader, types, env
- [ ] 共享模块：logger, errors, rate-limiter

### Phase 2: RAG Pipeline (3-4 天)

- [ ] Document: loader, chunker (markdown, javadoc)
- [ ] RAG: searcher, indexer, embedder, language-detect

### Phase 3: MCP Server (2-3 天)

- [ ] MCP server (官方 SDK)
- [ ] Tools: search, fetch, guidelines
- [ ] Instructions 动态构建
- [ ] HTTP server 集成

### Phase 4: CI/CD (1-2 天)

- [ ] GitHub Actions 矩阵构建
- [ ] Docker 构建脚本

### Phase 5: 测试与验证 (1-2 天)

- [ ] 单元测试
- [ ] 本地 Docker 验证
- [ ] MCP 客户端兼容性测试

---

## 八、编码规范（严格执行）

### 8.1 禁止 hardcode

| 类别 | 错误示例 | 正确做法 |
|------|-----------|----------|
| 版本号 | `"1.0.0"` 散落 5 处 | 从 `package.json` 单一来源读取 |
| 配置值 | `if lang === 'zh'` 硬编码判断 | 用配置文件驱动 |
| 魔法数字 | `limit = 100` | 抽取为常量或配置项 |
| URL 路径 | `cdn.grapecity.com.cn` 硬编码 | 从 `config.cdn_domain` 读取 |

### 8.2 DRY 原则

- 重复代码抽取为函数/类
- 相同逻辑只写一次
- 配置复用，不复制粘贴

### 8.3 TODO 管理

- 禁止留 TODO 后遗忘
- TODO 必须放入 GitHub Issues 追踪
- 每个任务完成后立即关闭

### 8.4 代码卫生

- 无用的 import 删除
- 未使用的变量删除
- 死代码立即清理

---

## 九、新增产品流程（零代码改动）

以新增 Wijmo 中文版为例：

```bash
# 1. 创建配置文件
mkdir -p products/wijmo
cat > products/wijmo/product.yaml << 'EOF'
id: wijmo
name: Wijmo
type: javascript
chunker: markdown
doc_subdirs: [apis, docs, demos]
EOF

cat > products/wijmo/cn.yaml << 'EOF'
lang: zh
company: GrapeCity
collection: wijmo_zh
raw_data: wijmo/cn
...

# 2. 放入文档数据
mkdir -p raw_data/wijmo/cn/apis raw_data/wijmo/cn/docs

# 3. 构建索引
npm run embed wijmo zh

# 4. 构建镜像
npm run build:image wijmo zh
```

**无需改任何代码。**

---

## 十、迁移检查清单

从当前 Python 迁移到 TypeScript 时，逐项确认：

- [ ] 版本号单一来源（package.json）
- [ ] 服务名统一（GC-DOC-MCP-Server）
- [ ] 全局变量改用依赖注入
- [ ] 配置对象缓存（不每次新建）
- [ ] 使用官方 MCP SDK
- [ ] Collection 名 {product}_{lang} 规范
- [ ] instructions 移到 YAML 配置
- [ ] 删除 requirements.txt（统一 pyproject.toml）
- [ ] healthcheck 统一
- [ ] Qdrant 客户端初始化抽取
- [ ] SearchResult 序列化抽取

---

**最后更新：2026-02-12**
