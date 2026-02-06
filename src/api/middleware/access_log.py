"""Access log middleware"""

import time
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from ...core.logger import AccessLogger, client_ip_ctx, request_id_ctx


class AccessLogMiddleware(BaseHTTPMiddleware):
	"""Access log middleware"""

	def __init__(self, app, access_logger: AccessLogger):
		super().__init__(app)
		self.access_logger = access_logger

	async def dispatch(self, request: Request, call_next):
		request_id = str(uuid.uuid4())[:8]
		client_ip = request.client.host if request.client else "unknown"

		# Set context variables
		request_id_ctx.set(request_id)
		client_ip_ctx.set(client_ip)

		# Inject into request.state
		request.state.request_id = request_id

		start = time.perf_counter()

		try:
			response: Response = await call_next(request)
			duration_ms = (time.perf_counter() - start) * 1000

			# Get extra info from request.state
			project = getattr(request.state, "project", None)
			tool = getattr(request.state, "tool", None)
			query = getattr(request.state, "query", None)
			result_count = getattr(request.state, "result_count", 0)

			# Log access (skip health check, MCP routes etc.)
			# MCP routes logged separately in mcp.py with more details
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
