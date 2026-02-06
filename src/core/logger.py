"""Structured logging system"""

import json
import logging
import logging.handlers
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Request context variables
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")
client_ip_ctx: ContextVar[str] = ContextVar("client_ip", default="")


class JSONFormatter(logging.Formatter):
	"""JSON formatter"""

	def format(self, record: logging.LogRecord) -> str:
		log_data = {
			"timestamp": datetime.now(timezone.utc).isoformat(),
			"level": record.levelname,
			"logger": record.name,
			"message": record.getMessage(),
		}

		# Add request context
		if request_id := request_id_ctx.get():
			log_data["request_id"] = request_id
		if client_ip := client_ip_ctx.get():
			log_data["client_ip"] = client_ip

		# Add extra fields
		if hasattr(record, "extra_data"):
			log_data.update(record.extra_data)

		# Exception info
		if record.exc_info:
			log_data["exception"] = self.formatException(record.exc_info)

		return json.dumps(log_data, ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
	"""Text formatter (for dev environment)"""

	def __init__(self):
		super().__init__(
			fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
			datefmt="%H:%M:%S"
		)


class AccessLogger:
	"""
	Access log recorder

	Records HTTP request access logs in JSON format with daily rotation.
	"""

	def __init__(self, log_dir: Path, backup_count: int = 180):
		"""
		Initialize access logger

		Args:
			log_dir: Log directory
			backup_count: Number of log files to keep (days), default 180
		"""
		self.logger = logging.getLogger("access")
		self.logger.setLevel(logging.INFO)
		self.logger.propagate = False

		# Ensure directory exists
		log_dir.mkdir(parents=True, exist_ok=True)
		log_file = log_dir / "access.log"

		# Daily rotating file handler
		handler = logging.handlers.TimedRotatingFileHandler(
			log_file,
			when="midnight",
			interval=1,
			backupCount=backup_count,
			encoding="utf-8"
		)
		handler.setFormatter(JSONFormatter())
		handler.suffix = "%Y-%m-%d"

		# Clear existing handlers (avoid duplicates)
		self.logger.handlers.clear()
		self.logger.addHandler(handler)

	def log(
		self,
		request_id: str,
		client_ip: str,
		method: str,
		path: str,
		project: Optional[str] = None,
		tool: Optional[str] = None,
		query: Optional[str] = None,
		duration_ms: float = 0.0,
		status_code: int = 200,
		result_count: int = 0,
		error: Optional[str] = None,
		**extra: Any
	) -> None:
		"""
		Log an access entry

		Args:
			request_id: Request ID
			client_ip: Client IP
			method: HTTP method
			path: Request path
			project: Project name
			tool: MCP tool name
			query: Search query
			duration_ms: Request duration (ms)
			status_code: HTTP status code
			result_count: Number of results
			error: Error message
			**extra: Additional fields
		"""
		record = self.logger.makeRecord(
			self.logger.name,
			logging.INFO,
			"", 0, "", (), None
		)
		record.extra_data = {
			"type": "access",
			"request_id": request_id,
			"client_ip": client_ip,
			"method": method,
			"path": path,
			"project": project,
			"tool": tool,
			"query": query,
			"duration_ms": round(duration_ms, 2),
			"status_code": status_code,
			"result_count": result_count,
			"error": error,
			**extra
		}
		self.logger.handle(record)

	def log_mcp_call(
		self,
		request_id: str,
		client_ip: str,
		project: str,
		tool: str,
		arguments: dict,
		duration_ms: float,
		status_code: int,
		result_count: int = 0,
		error: Optional[str] = None
	) -> None:
		"""
		Log MCP call

		Args:
			request_id: Request ID
			client_ip: Client IP
			project: Project name
			tool: Tool name
			arguments: Call arguments
			duration_ms: Duration
			status_code: Status code
			result_count: Result count
			error: Error message
		"""
		self.log(
			request_id=request_id,
			client_ip=client_ip,
			method="POST",
			path=f"/mcp/{project}",
			project=project,
			tool=tool,
			query=arguments.get("query"),
			duration_ms=duration_ms,
			status_code=status_code,
			result_count=result_count,
			error=error,
			mcp_method="tools/call",
			arguments=arguments
		)


def setup_logging(
	log_level: str = "INFO",
	log_format: str = "json",
	log_dir: Optional[Path] = None
) -> None:
	"""
	Configure global logging

	Args:
		log_level: Log level
		log_format: Log format (json or text)
		log_dir: Log directory (optional, for file logging)
	"""
	root = logging.getLogger()
	root.setLevel(getattr(logging, log_level.upper()))

	# Clear existing handlers
	root.handlers.clear()

	# Console handler
	console_handler = logging.StreamHandler(sys.stdout)
	if log_format == "json":
		console_handler.setFormatter(JSONFormatter())
	else:
		console_handler.setFormatter(TextFormatter())
	root.addHandler(console_handler)

	# Add file handler if log_dir specified
	if log_dir:
		log_dir.mkdir(parents=True, exist_ok=True)
		file_handler = logging.handlers.TimedRotatingFileHandler(
			log_dir / "app.log",
			when="midnight",
			interval=1,
			backupCount=30,
			encoding="utf-8"
		)
		file_handler.setFormatter(JSONFormatter())
		file_handler.suffix = "%Y-%m-%d"
		root.addHandler(file_handler)


def get_logger(name: str) -> logging.Logger:
	"""Get logger by name"""
	return logging.getLogger(name)
