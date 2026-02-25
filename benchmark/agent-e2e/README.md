# Layer 2: Agent 端到端测试方案设计

> 本文档为方案设计，暂不实现。待 Layer 0/1 稳定运行后启动开发。

## 目标

量化回答核心问题：**MCP Server 是否真正帮助 AI coding agent 写出更好的代码？**

## 架构

```
promptfoo (评测编排)
  └─ exec provider
       └─ run-agent-e2e.sh
            ├─ docker run (隔离环境)
            │   ├─ 挂载 PROMPT.md（只读）
            │   ├─ 配置 MCP Server 连接（或不配置，作为 baseline）
            │   ├─ 运行 Claude Code CLI
            │   └─ 产出代码写入 /workspace
            ├─ 复制 /workspace 产出到宿主机 results/
            └─ vitest EVAL.ts (校验产出)
```

## Docker 沙箱设计

### 为什么需要沙箱

| 场景 | 无沙箱的风险 | 沙箱的保障 |
|------|-------------|-----------|
| agent 执行 `npm install` | 污染宿主机 node_modules | 容器内隔离 |
| agent 写错文件路径 | 覆盖宿主机文件 | 写操作限制在 /workspace |
| 多轮测试间状态 | 上轮残留文件影响下轮 | 每轮新容器，确定性环境 |
| benchmark 可复现性 | 依赖宿主机环境差异 | Docker 镜像固定环境 |
| CI 运行 | GitHub Actions runner 被污染 | 容器隔离 |

核心价值：**可复现性**。没有沙箱的 benchmark 数据不可信。

### Dockerfile

```dockerfile
FROM node:20-slim

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /workspace

# 入口脚本：读取 PROMPT.md → 调用 agent → 退出
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

### entrypoint.sh

```bash
#!/bin/bash
set -e

PROMPT_FILE="${PROMPT_FILE:-/eval/PROMPT.md}"
MCP_CONFIG="${MCP_CONFIG:-}"

# 如果提供了 MCP 配置，写入 Claude Code 设置
if [ -n "$MCP_CONFIG" ]; then
    mkdir -p /root/.claude
    echo "$MCP_CONFIG" > /root/.claude/settings.json
fi

# 运行 Claude Code，读取 PROMPT.md 作为输入
claude -p "$(cat $PROMPT_FILE)" --output-format json

echo "Agent execution completed."
```

### Docker 网络配置

```yaml
# docker-compose.eval.yml
services:
  agent-sandbox:
    build: .
    volumes:
      - ./eval-input:/eval:ro          # PROMPT.md（只读）
      - ./eval-output:/workspace       # agent 产出（可写）
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - MCP_CONFIG=${MCP_CONFIG}
    networks:
      - eval-net

  # MCP Server 需要在同一网络中可达
  # 或者使用宿主机网络：network_mode: host

networks:
  eval-net:
    driver: bridge
```

## A/B 实验设计

### 实验矩阵

| 实验 | MCP 配置 | 目的 |
|------|---------|------|
| `baseline` | 无 MCP，agent 仅靠预训练知识 | 基线：模型本身能做到什么 |
| `with-mcp` | 配置 MCP Server 连接 | 测量 MCP 的实际提升 |
| `with-agents-md` | 注入静态 AGENTS.md | 对比静态文档 vs 动态检索 |

### MCP 配置注入

baseline 实验：不注入 MCP_CONFIG 环境变量。

with-mcp 实验：

```json
{
  "mcpServers": {
    "gc-doc": {
      "url": "http://host.docker.internal:8902/mcp/spreadjs"
    }
  }
}
```

with-agents-md 实验：通过 Docker volume 挂载预编译的 AGENTS.md 到 /workspace。

## Eval Fixture 结构

每个 eval 是一个独立目录：

```
agent-e2e/evals/
├── spreadjs-001-cdn-setup/
│   ├── PROMPT.md           # 任务描述
│   ├── EVAL.ts             # vitest 断言（对 agent 隐藏）
│   ├── package.json        # 脚手架项目依赖
│   └── index.html          # 脚手架起始文件
│
├── spreadjs-002-conditional-format/
│   ├── PROMPT.md
│   ├── EVAL.ts
│   ├── package.json
│   └── src/
│       └── app.js          # 脚手架
│
├── forguncy-001-server-command/
│   ├── PROMPT.md
│   ├── EVAL.ts
│   ├── package.json        # .NET 项目可能不需要这个
│   └── ServerCommand.cs    # 脚手架
│
└── ...
```

### PROMPT.md 示例

```markdown
# 任务：创建 SpreadJS 条件格式页面

创建一个 HTML 页面，使用 SpreadJS 实现以下功能：

1. 创建一个 10x10 的表格
2. A 列填充 1-100 的随机数
3. 对 A 列应用条件格式：大于 50 的单元格背景变为红色
4. 使用 SpreadJS 19.0.0 版本的 CDN

要求：
- 页面可以直接在浏览器中打开
- 所有 SpreadJS 资源通过 CDN 引入
```

### EVAL.ts 示例

```typescript
import { existsSync, readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

describe('SpreadJS CDN Setup', () => {
    it('index.html should exist', () => {
        expect(existsSync('index.html')).toBe(true);
    });

    it('should reference SpreadJS CDN with correct version', () => {
        const html = readFileSync('index.html', 'utf-8');
        expect(html).toContain('cdn.grapecity.com.cn');
        expect(html).toMatch(/19\.\d+\.\d+/);
    });

    it('should include required core script', () => {
        const html = readFileSync('index.html', 'utf-8');
        expect(html).toContain('gc.spread.sheets.all.min.js');
    });

    it('should include stylesheet', () => {
        const html = readFileSync('index.html', 'utf-8');
        expect(html).toMatch(/gc\.spread\.sheets\.\w+\.css/);
    });

    it('should contain conditional formatting logic', () => {
        const html = readFileSync('index.html', 'utf-8');
        // 检查是否使用了条件格式 API（不暗示具体答案）
        expect(html).toMatch(/conditionalFormat|ConditionalFormat|addRule|formatRule/i);
    });
});
```

## 编排脚本

`run-agent-e2e.sh` — 单个 eval 的完整执行流程：

```bash
#!/bin/bash
set -e

EVAL_DIR=$1           # e.g., evals/spreadjs-001-cdn-setup
EXPERIMENT=$2         # e.g., baseline | with-mcp | with-agents-md
OUTPUT_DIR=$3         # e.g., results/spreadjs-001/baseline/run-1

# 1. 准备工作目录
mkdir -p "$OUTPUT_DIR"
cp -r "$EVAL_DIR"/* "$OUTPUT_DIR/" 2>/dev/null || true
rm -f "$OUTPUT_DIR/EVAL.ts"  # agent 不能看到 EVAL

# 2. 构建 MCP 配置
MCP_CONFIG=""
if [ "$EXPERIMENT" = "with-mcp" ]; then
    MCP_CONFIG='{"mcpServers":{"gc-doc":{"url":"http://host.docker.internal:8902/mcp/spreadjs"}}}'
fi

# 3. 在 Docker 中运行 agent
docker run --rm \
    -v "$OUTPUT_DIR:/workspace" \
    -v "$EVAL_DIR/PROMPT.md:/eval/PROMPT.md:ro" \
    -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" \
    -e "MCP_CONFIG=$MCP_CONFIG" \
    --network host \
    gc-doc-mcp-agent-sandbox

# 4. 运行 EVAL.ts 校验
cp "$EVAL_DIR/EVAL.ts" "$OUTPUT_DIR/"
cd "$OUTPUT_DIR" && npx vitest run EVAL.ts --reporter=json > eval-result.json 2>&1

# 5. 输出结果
cat "$OUTPUT_DIR/eval-result.json"
```

## 量化指标

- **Pass rate**: 每个实验的通过率（EVAL.ts 全部断言通过）
- **Per-assertion pass rate**: 单条断言的通过率（定位具体薄弱环节）
- **Token usage**: agent 消耗的 token 数（从 transcript 解析）
- **Tool invocation rate**: MCP 工具被调用的比例（with-mcp 实验中 agent 是否真的用了 MCP）
- **Latency**: 从 agent 启动到完成的总耗时

## 无沙箱替代方案（开发调试用）

在本地开发/调试 eval 时不想启动 Docker：

```bash
# 在临时目录中运行
TMPDIR=$(mktemp -d /tmp/eval-XXXXXX)
cp -r evals/spreadjs-001-cdn-setup/* "$TMPDIR/"
cd "$TMPDIR"

# 直接运行 Claude Code（无隔离）
claude -p "$(cat PROMPT.md)"

# 手动运行 EVAL
npx vitest run EVAL.ts

# 清理
rm -rf "$TMPDIR"
```

仅限本地调试。CI 必须用 Docker。

## 实施优先级

1. 先让 Layer 0 + Layer 1 稳定运行，积累数据
2. 设计 3-5 个版本敏感型 eval fixture（CDN URL、npm scope 等，baseline 大概率失败）
3. 构建 Docker 沙箱镜像
4. 编排脚本 + 单次运行验证
5. 接入 promptfoo 做批量运行和结果对比
