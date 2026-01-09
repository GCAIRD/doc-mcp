"""自定义异常"""


class GCDocMCPError(Exception):
	"""基础异常类"""
	pass


class ConfigError(GCDocMCPError):
	"""配置错误"""
	pass


class ProjectNotFoundError(GCDocMCPError):
	"""项目不存在"""
	pass


class SearchError(GCDocMCPError):
	"""搜索错误"""
	pass


class IndexError(GCDocMCPError):
	"""索引错误"""
	pass
