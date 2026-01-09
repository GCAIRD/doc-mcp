# GC-DOC-MCP

GrapeCity 产品文档 RAG + MCP 服务。

## 安装

```bash
# 开发模式（源码可编辑，改动实时生效）
pip install -e .

# 生产模式（固定版本，复制到 site-packages）
pip install .

# 复制并配置环境变量
cp .env.example .env
# 编辑 .env，填入 VOYAGE_API_KEY
```

## 构建索引

将文档放入 `raw_data/{project}/` 目录，然后运行：

```bash
# 1. 启动qdrant
docker compose up -d qdrant
# 2. 构建索引
python scripts/embed.py spreadjs
python scripts/embed.py gcexcel
# 3. 启动全部服务
docker compose up -d
```

其他 embed 命令：

```bash
# 构建所有项目
python scripts/embed.py

# 重建索引（清空 collection）
python scripts/embed.py spreadjs --recreate

# 从头开始，不从断点恢复
python scripts/embed.py --restart
```

支持断点续传，中断后重新运行会自动恢复。

## 服务管理

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f

# 停止服务
docker compose down
```

## API 端点

- `POST /search` - RAG 搜索
- `GET /doc/{doc_id}?project=xxx` - 获取完整文档
- `POST /mcp/{project}` - MCP 协议端点
- `GET /health` - 健康检查

## 架构

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│ MCP Server  │────▶│ RAG Service │
│  (Claude)   │     │   :8889     │     │   :8888     │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                        ┌──────▼──────┐
                                        │   Qdrant    │
                                        │   :6333     │
                                        └─────────────┘
```

- **MCP Server**: 对外暴露，处理 MCP 协议
- **RAG Service**: 内部服务，执行向量搜索
- **Qdrant**: 向量数据库，内部网络隔离
