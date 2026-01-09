"""访问日志中间件"""

import time
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from ...core.logger import AccessLogger, client_ip_ctx, request_id_ctx


class AccessLogMiddleware(BaseHTTPMiddleware):
	"""访问日志中间件"""

	def __init__(self, app, access_logger: AccessLogger):
		super().__init__(app)
		self.access_logger = access_logger

	async def dispatch(self, request: Request, call_next):
		request_id = str(uuid.uuid4())[:8]
		client_ip = request.client.host if request.client else "unknown"

		# 设置上下文变量
		request_id_ctx.set(request_id)
		client_ip_ctx.set(client_ip)

		# 注入到request.state
		request.state.request_id = request_id

		start = time.perf_counter()

		try:
			response: Response = await call_next(request)
			duration_ms = (time.perf_counter() - start) * 1000

			# 从 request.state 获取额外信息
			project = getattr(request.state, "project", None)
			tool = getattr(request.state, "tool", None)
			query = getattr(request.state, "query", None)
			result_count = getattr(request.state, "result_count", 0)

			# 记录访问日志（排除健康检查、MCP路由等）
			# MCP路由由 mcp.py 内部单独记录，包含更完整的信息
			skip_paths = ["/health", "/favicon.ico"]
			is_mcp = request.url.path.startswith("/mcp")
			if request.url.path not in skip_paths and not is_mcp:
				self.access_logger.log(
					request_id=request_id,
					client_ip=client_ip,
					method=request.method,
					path=request.url.path,
					project=project,
					tool=tool,
					query=query,
					duration_ms=duration_ms,
					status_code=response.status_code,
					result_count=result_count,
				)

			return response

		except Exception as e:
			duration_ms = (time.perf_counter() - start) * 1000
			self.access_logger.log(
				request_id=request_id,
				client_ip=client_ip,
				method=request.method,
				path=request.url.path,
				project=None,
				tool=None,
				query=None,
				duration_ms=duration_ms,
				status_code=500,
				error=str(e),
			)
			raise
