#!/usr/bin/env python
"""
Service startup script

Usage:
	python scripts/serve.py                    # RAG service
	python scripts/serve.py --mode mcp         # MCP service
	python scripts/serve.py --mode all         # Both services
	python scripts/serve.py --port 8900        # Specify port
"""

import argparse
import logging
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import uvicorn

from src.api.app import create_app
from src.core.config import ProjectConfig, Settings

logger = logging.getLogger(__name__)


def main():
	parser = argparse.ArgumentParser(description="Start service")
	parser.add_argument(
		"--mode",
		choices=["rag", "mcp", "all"],
		default="all",
		help="Run mode: rag(search), mcp(MCP service), all(both, default)",
	)
	parser.add_argument("--port", type=int, default=None, help="Service port")
	parser.add_argument("--host", default=None, help="Service host")
	args = parser.parse_args()

	# Initialize config
	settings = Settings()
	project_config = ProjectConfig()

	# Determine port
	if args.port:
		port = args.port
	elif args.mode == "mcp":
		port = settings.mcp_port
	else:
		port = settings.server_port

	host = args.host or settings.server_host

	# Create app
	app = create_app(settings=settings, project_config=project_config, mode=args.mode)

	# Print startup info
	print("=" * 60)
	print("MCS-DOC-MCP Service v1.0.0")
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

	# Start server
	uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
	main()
