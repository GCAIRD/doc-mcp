"""Pydantic 模型定义"""

from typing import Dict, List, Optional

from pydantic import BaseModel


class SearchRequest(BaseModel):
	"""搜索请求"""

	query: str
	project: str
	limit: int = 5
	use_rerank: bool = True
	debug: bool = False


class SearchResultItem(BaseModel):
	"""搜索结果项"""

	rank: int
	doc_id: str
	chunk_id: str
	score: float
	content: str
	content_preview: str
	metadata: Dict


class SearchResponse(BaseModel):
	"""搜索响应"""

	query: str
	project: str
	results: List[SearchResultItem]
	search_time_ms: float
	rerank_used: bool
	debug_info: Optional[Dict] = None


class DocumentResponse(BaseModel):
	"""文档响应"""

	doc_id: str
	project: str
	chunk_count: int
	full_content: str
	chunks: List[Dict]
	metadata: Dict


class ProjectInfo(BaseModel):
	"""项目信息"""

	name: str
	collection: str
	description: str
	available: bool


class HealthResponse(BaseModel):
	"""健康检查响应"""

	status: str
	projects: List[str]
