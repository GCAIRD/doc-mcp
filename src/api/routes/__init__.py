from .health import router as health_router
from .search import router as search_router
from .mcp import router as mcp_router

__all__ = ['health_router', 'search_router', 'mcp_router']
