"""结构化日志系统"""

import json
import logging
import logging.handlers
import sys
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# 请求上下文变量
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")
client_ip_ctx: ContextVar[str] = ContextVar("client_ip", default="")


class JSONFormatter(logging.Formatter):
	"""JSON 格式化器"""

	def format(self, record: logging.LogRecord) -> str:
		log_data = {
			"timestamp": datetime.now(timezone.utc).isoformat(),
			"level": record.levelname,
			"logger": record.name,
			"message": record.getMessage(),
		}

		# 添加请求上下文
		if request_id := request_id_ctx.get():
			log_data["request_id"] = request_id
		if client_ip := client_ip_ctx.get():
			log_data["client_ip"] = client_ip

		# 添加额外字段
		if hasattr(record, "extra_data"):
			log_data.update(record.extra_data)

		# 异常信息
		if record.exc_info:
			log_data["exception"] = self.formatException(record.exc_info)

		return json.dumps(log_data, ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
	"""文本格式化器（开发环境）"""

	def __init__(self):
		super().__init__(
			fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
			datefmt="%H:%M:%S"
		)


class AccessLogger:
	"""
	访问日志记录器

	专门记录 HTTP 请求的访问日志，格式化为 JSON，按天轮转。
	"""

	def __init__(self, log_dir: Path, backup_count: int = 180):
		"""
		初始化访问日志记录器

		Args:
			log_dir: 日志目录
			backup_count: 保留的日志文件数量（天数），默认180天
		"""
		self.logger = logging.getLogger("access")
		self.logger.setLevel(logging.INFO)
		self.logger.propagate = False

		# 确保目录存在
		log_dir.mkdir(parents=True, exist_ok=True)
		log_file = log_dir / "access.log"

		# 按天轮转的文件处理器
		handler = logging.handlers.TimedRotatingFileHandler(
			log_file,
			when="midnight",
			interval=1,
			backupCount=backup_count,
			encoding="utf-8"
		)
		handler.setFormatter(JSONFormatter())
		handler.suffix = "%Y-%m-%d"

		# 清除已有处理器（避免重复添加）
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
		记录一条访问日志

		Args:
			request_id: 请求ID
			client_ip: 客户端IP
			method: HTTP方法
			path: 请求路径
			project: 项目名称
			tool: MCP工具名称
			query: 搜索查询
			duration_ms: 请求耗时（毫秒）
			status_code: HTTP状态码
			result_count: 返回结果数量
			error: 错误信息
			**extra: 额外字段
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
		记录 MCP 调用日志

		Args:
			request_id: 请求ID
			client_ip: 客户端IP
			project: 项目名称
			tool: 工具名称
			arguments: 调用参数
			duration_ms: 耗时
			status_code: 状态码
			result_count: 结果数量
			error: 错误信息
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
	配置全局日志

	Args:
		log_level: 日志级别
		log_format: 日志格式（json 或 text）
		log_dir: 日志目录（可选，用于文件日志）
	"""
	root = logging.getLogger()
	root.setLevel(getattr(logging, log_level.upper()))

	# 清除已有处理器
	root.handlers.clear()

	# 控制台处理器
	console_handler = logging.StreamHandler(sys.stdout)
	if log_format == "json":
		console_handler.setFormatter(JSONFormatter())
	else:
		console_handler.setFormatter(TextFormatter())
	root.addHandler(console_handler)

	# 如果指定了日志目录，添加文件处理器
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
	"""获取指定名称的logger"""
	return logging.getLogger(name)
