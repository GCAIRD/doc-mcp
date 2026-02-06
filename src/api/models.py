"""Pydantic model definitions"""

from typing import Dict, List, Optional

from pydantic import BaseModel


class SearchRequest(BaseModel):
	"""Search request"""

	query: str
	project: str
	limit: int = 5
	use_rerank: bool = True
	debug: bool = False


class SearchResultItem(BaseModel):
	"""Search result item"""

	rank: int
	doc_id: str
	chunk_id: str
	score: float
	content: str
	content_preview: str
	metadata: Dict


class SearchResponse(BaseModel):
	"""Search response"""

	query: str
	project: str
	results: List[SearchResultItem]
	search_time_ms: float
	rerank_used: bool
	debug_info: Optional[Dict] = None


class DocumentResponse(BaseModel):
	"""Document response"""

	doc_id: str
	project: str
	chunk_count: int
	full_content: str
	chunks: List[Dict]
	metadata: Dict


class ProjectInfo(BaseModel):
	"""Project info"""

	name: str
	collection: str
	description: str
	available: bool


class HealthResponse(BaseModel):
	"""Health check response"""

	status: str
	projects: List[str]
