#!/usr/bin/env python
"""
服务启动脚本

用法:
	python scripts/serve.py                    # RAG服务
	python scripts/serve.py --mode mcp         # MCP服务
	python scripts/serve.py --mode all         # 同时启动
	python scripts/serve.py --port 8888        # 指定端口
"""

import argparse
import logging
import sys
from pathlib import Path

# 添加src到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

import uvicorn

from src.api.app import create_app
from src.core.config import ProjectConfig, Settings

logger = logging.getLogger(__name__)


def main():
	parser = argparse.ArgumentParser(description="启动服务")
	parser.add_argument(
		"--mode",
		choices=["rag", "mcp", "all"],
		default="rag",
		help="运行模式: rag(搜索服务), mcp(MCP服务), all(两者)",
	)
	parser.add_argument("--port", type=int, default=None, help="服务端口")
	parser.add_argument("--host", default=None, help="服务地址")
	args = parser.parse_args()

	# 初始化配置
	settings = Settings()
	project_config = ProjectConfig()

	# 确定端口
	if args.port:
		port = args.port
	elif args.mode == "mcp":
		port = settings.mcp_port
	else:
		port = settings.server_port

	host = args.host or settings.server_host

	# 创建应用
	app = create_app(settings=settings, project_config=project_config, mode=args.mode)

	# 打印启动信息
	print("=" * 60)
	print("GC-DOC-MCP Service v1.0.0")
	print("=" * 60)
	print(f"Mode: {args.mode}")
	print(f"Projects: {project_config.project_names}")
	print(f"Embed Model: {settings.voyage_embed_model}")
	print(f"Rerank Model: {settings.voyage_rerank_model}")
	print("=" * 60)
	print(f"Server: http://{host}:{port}")
	print(f"API Docs: http://{host}:{port}/docs")
	if args.mode in ["mcp", "all"]:
		print(f"MCP Endpoint: http://{host}:{port}/mcp/{{project}}")
	print("=" * 60)

	# 启动服务
	uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
	main()
