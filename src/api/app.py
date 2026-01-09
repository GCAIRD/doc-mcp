"""FastAPI 应用工厂"""

import logging
from contextlib import asynccontextmanager
from typing import Dict

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ..core.config import ProjectConfig, Settings
from ..core.logger import AccessLogger, setup_logging
from ..embedding.searcher import VoyageSearcher
from .middleware.access_log import AccessLogMiddleware
from .routes import health_router, mcp_router, search_router

logger = logging.getLogger(__name__)

# 全局变量
_searchers: Dict[str, VoyageSearcher] = {}
_settings: Settings | None = None
_project_config: ProjectConfig | None = None
_access_logger: AccessLogger | None = None
_http_client: httpx.AsyncClient | None = None


def get_searchers() -> Dict[str, VoyageSearcher]:
	return _searchers


def get_settings() -> Settings:
	if _settings is None:
		raise RuntimeError("Settings not initialized")
	return _settings


def get_project_config() -> ProjectConfig:
	if _project_config is None:
		raise RuntimeError("ProjectConfig not initialized")
	return _project_config


def get_access_logger() -> AccessLogger | None:
	return _access_logger


def get_http_client() -> httpx.AsyncClient:
	"""获取共享的 HTTP 客户端"""
	if _http_client is None:
		raise RuntimeError("HTTP client not initialized")
	return _http_client


def create_app(
	settings: Settings | None = None,
	project_config: ProjectConfig | None = None,
	mode: str = "rag",
) -> FastAPI:
	"""
	创建 FastAPI 应用

	Args:
		settings: 环境变量配置
		project_config: 项目配置
		mode: 运行模式
			- "rag": RAG 服务（搜索API）
			- "mcp": MCP 服务（MCP协议）
			- "all": 同时提供两者
	"""
	global _searchers, _settings, _project_config, _access_logger, _http_client

	# 初始化配置
	if settings is None:
		settings = Settings()
	if project_config is None:
		project_config = ProjectConfig()

	_settings = settings
	_project_config = project_config

	# 设置日志
	setup_logging(
		log_level=settings.log_level,
		log_format=settings.log_format,
		log_dir=settings.log_dir if settings.log_format == "json" else None,
	)

	# 初始化访问日志
	_access_logger = AccessLogger(settings.log_dir, backup_count=180)

	@asynccontextmanager
	async def lifespan(app: FastAPI):
		"""应用生命周期管理"""
		global _http_client
		# 启动时创建共享 HTTP 客户端
		_http_client = httpx.AsyncClient(timeout=30.0)
		logger.info("HTTP client initialized")
		yield
		# 关闭时清理
		await _http_client.aclose()
		_http_client = None
		logger.info("HTTP client closed")

	# 创建应用
	app = FastAPI(
		title="GC-DOC-MCP Service",
		description="GrapeCity Documentation MCP Service",
		version="1.0.0",
		lifespan=lifespan,
	)

	# CORS: allow_origins=["*"] 时不能设置 allow_credentials=True
	app.add_middleware(
		CORSMiddleware,
		allow_origins=["*"],
		allow_credentials=False,
		allow_methods=["*"],
		allow_headers=["*"],
	)

	# 访问日志中间件
	app.add_middleware(AccessLogMiddleware, access_logger=_access_logger)

	# 初始化 Searchers（RAG 和 ALL 模式需要）
	if mode in ["rag", "all"]:
		logger.info("初始化 Searchers...")
		for name in project_config.project_names:
			collection = project_config.get_collection_name(name)
			try:
				_searchers[name] = VoyageSearcher(
					settings=settings,
					project_config=project_config,
					collection_name=collection,
				)
				logger.info(f"  ✓ {name} -> {collection}")
			except Exception as e:
				logger.warning(f"  ✗ {name}: {e}")

	# 注册路由
	app.include_router(health_router, tags=["health"])

	if mode in ["rag", "all"]:
		app.include_router(search_router, tags=["search"])

	if mode in ["mcp", "all"]:
		app.include_router(mcp_router, tags=["mcp"])

	@app.get("/")
	async def root():
		"""服务信息"""
		return {
			"name": "GC-DOC-MCP-Server",
			"version": "1.0.0",
			"mode": mode,
			"projects": project_config.project_names,
		}

	return app
