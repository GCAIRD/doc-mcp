"""FastAPI application factory"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from ..core.config import ProjectConfig, Settings
from ..core.logger import AccessLogger, setup_logging
from ..embedding.searcher import VoyageSearcher
from .middleware.access_log import AccessLogMiddleware
from .routes import health_router, mcp_router, search_router

logger = logging.getLogger(__name__)

# Global variables
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
	"""Get shared HTTP client"""
	if _http_client is None:
		raise RuntimeError("HTTP client not initialized")
	return _http_client


def create_app(
	settings: Settings | None = None,
	project_config: ProjectConfig | None = None,
	mode: str = "rag",
) -> FastAPI:
	"""
	Create FastAPI application

	Args:
		settings: Environment variable config
		project_config: Project config
		mode: Run mode
			- "rag": RAG service (search API)
			- "mcp": MCP service (MCP protocol)
			- "all": Both services
	"""
	global _searchers, _settings, _project_config, _access_logger, _http_client

	# Initialize config
	if settings is None:
		settings = Settings()
	if project_config is None:
		project_config = ProjectConfig()

	_settings = settings
	_project_config = project_config

	# Setup logging
	setup_logging(
		log_level=settings.log_level,
		log_format=settings.log_format,
		log_dir=settings.log_dir if settings.log_format == "json" else None,
	)

	# Initialize access logger
	_access_logger = AccessLogger(settings.log_dir, backup_count=180)

	@asynccontextmanager
	async def lifespan(app: FastAPI):
		"""Application lifecycle management"""
		global _http_client
		# Create shared HTTP client on startup
		_http_client = httpx.AsyncClient(timeout=30.0)
		logger.info("HTTP client initialized")
		yield
		# Cleanup on shutdown
		await _http_client.aclose()
		_http_client = None
		logger.info("HTTP client closed")

	# Create application
	app = FastAPI(
		title="MCS-DOC-MCP Service",
		description="Mescius Documentation MCP Service",
		version="1.0.0",
		lifespan=lifespan,
	)

	# CORS: allow_origins=["*"] cannot set allow_credentials=True
	app.add_middleware(
		CORSMiddleware,
		allow_origins=["*"],
		allow_credentials=False,
		allow_methods=["*"],
		allow_headers=["*"],
	)

	# Access log middleware
	app.add_middleware(AccessLogMiddleware, access_logger=_access_logger)

	# Initialize Searchers (RAG and ALL modes)
	if mode in ["rag", "all"]:
		logger.info("Initializing Searchers...")
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

	# Register routes
	app.include_router(health_router, tags=["health"])

	if mode in ["rag", "all"]:
		app.include_router(search_router, tags=["search"])

	if mode in ["mcp", "all"]:
		app.include_router(mcp_router, tags=["mcp"])

	# Static file service (tutorial page)
	static_dir = Path(__file__).parent.parent.parent / "tutorial" / "dist"
	if static_dir.exists():
		# Mount static assets (js, css, assets)
		app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

		@app.get("/")
		async def serve_index():
			"""Return tutorial homepage"""
			return FileResponse(static_dir / "index.html")
	else:
		@app.get("/")
		async def root():
			"""Service info"""
			return {
				"name": "MCS-DOC-MCP-Server",
				"version": "1.0.0",
				"mode": mode,
				"projects": project_config.project_names,
			}

	return app
