"""Configuration - env vars take precedence, YAML for project definitions"""

from pathlib import Path

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
	"""Environment variable settings"""

	# Voyage API
	voyage_api_key: str = Field("", validation_alias="VOYAGE_API_KEY")
	voyage_embed_model: str = Field("voyage-code-3", validation_alias="VOYAGE_EMBED_MODEL")
	voyage_rerank_model: str = Field("rerank-2.5", validation_alias="VOYAGE_RERANK_MODEL")
	voyage_rpm_limit: int = Field(2000, validation_alias="VOYAGE_RPM_LIMIT")
	voyage_tpm_limit: int = Field(3000000, validation_alias="VOYAGE_TPM_LIMIT")

	# Qdrant
	qdrant_url: str = Field("http://localhost:6333", validation_alias="QDRANT_URL")
	qdrant_api_key: str = Field("", validation_alias="QDRANT_API_KEY")

	# Server
	server_host: str = Field("0.0.0.0", validation_alias="SERVER_HOST")
	server_port: int = Field(8900, validation_alias="SERVER_PORT")
	mcp_port: int = Field(8901, validation_alias="MCP_PORT")

	# Logging
	log_level: str = Field("INFO", validation_alias="LOG_LEVEL")
	log_format: str = Field("json", validation_alias="LOG_FORMAT")
	log_dir: Path = Field(Path("./storage/logs"), validation_alias="LOG_DIR")

	# Embedding
	chunk_size: int = Field(3000, validation_alias="CHUNK_SIZE")
	chunk_overlap: int = Field(200, validation_alias="CHUNK_OVERLAP")
	batch_size: int = Field(128, validation_alias="BATCH_SIZE")

	# Document Language (zh/en/ja) - Primary document language. Dense-only when query lang differs.
	doc_language: str = Field("en", validation_alias="DOC_LANGUAGE")

	model_config = {
		"env_file": ".env",
		"env_file_encoding": "utf-8",
		"extra": "ignore",
	}


class ProjectConfig:
	"""Project configuration (loaded from YAML)"""

	def __init__(self, yaml_path: Path | None = None):
		if yaml_path is None:
			yaml_path = Path(__file__).parent.parent.parent / "config" / "projects.yaml"

		self._config_dir = yaml_path.parent.parent

		if not yaml_path.exists():
			raise FileNotFoundError(f"Project config not found: {yaml_path}")

		with open(yaml_path, "r", encoding="utf-8") as f:
			self._data = yaml.safe_load(f)

	def _resolve_path(self, path: str) -> Path:
		"""Resolve relative path to absolute"""
		p = Path(path)
		if p.is_absolute():
			return p
		return self._config_dir / path

	@property
	def projects(self) -> dict:
		return self._data.get("projects", {})

	@property
	def project_names(self) -> list[str]:
		return list(self.projects.keys())

	def get_project(self, name: str) -> dict:
		if name not in self.projects:
			raise ValueError(f"Project '{name}' not found. Available: {self.project_names}")
		return self.projects[name]

	def get_collection_name(self, project: str) -> str:
		return self.get_project(project)["collection"]

	def get_raw_data_path(self, project: str) -> Path:
		raw_data = self.get_project(project)["raw_data"]
		return self._resolve_path(raw_data)

	def get_chunker_type(self, project: str) -> str:
		return self.get_project(project).get("chunker", "markdown")

	def get_description(self, project: str) -> str:
		return self.get_project(project).get("description", "")

	def get_resources(self, project: str) -> dict:
		"""Get project resources config"""
		return self.get_project(project).get("resources", {})

	# Search config
	@property
	def prefetch_limit(self) -> int:
		return self._data.get("search", {}).get("prefetch_limit", 20)

	@property
	def rerank_top_k(self) -> int:
		return self._data.get("search", {}).get("rerank_top_k", 10)

	@property
	def default_limit(self) -> int:
		return self._data.get("search", {}).get("default_limit", 5)


def get_settings() -> Settings:
	"""Get Settings instance (creates new each call)"""
	return Settings()


def get_project_config(yaml_path: Path | None = None) -> ProjectConfig:
	"""Get ProjectConfig instance (creates new each call)"""
	return ProjectConfig(yaml_path)
