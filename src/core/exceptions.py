"""Custom exceptions"""


class MCSDocMCPError(Exception):
	"""Base exception class"""
	pass


class ConfigError(MCSDocMCPError):
	"""Configuration error"""
	pass


class ProjectNotFoundError(MCSDocMCPError):
	"""Project not found"""
	pass


class SearchError(MCSDocMCPError):
	"""Search error"""
	pass


class IndexError(MCSDocMCPError):
	"""Index error"""
	pass
