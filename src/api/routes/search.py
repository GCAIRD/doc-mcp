"""搜索 API 路由"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request

from ..models import (
	DocumentResponse,
	SearchRequest,
	SearchResponse,
	SearchResultItem,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def get_searcher(project: str):
	"""获取项目对应的searcher"""
	from ..app import get_searchers

	searchers = get_searchers()
	if project not in searchers:
		available = list(searchers.keys())
		raise HTTPException(
			status_code=400,
			detail=f"项目 '{project}' 不存在。可用项目: {available}",
		)
	return searchers[project]


@router.post("/search", response_model=SearchResponse)
async def search(request: Request, body: SearchRequest):
	"""执行RAG搜索"""
	searcher = get_searcher(body.project)

	# 记录到request.state供日志使用
	request.state.project = body.project
	request.state.query = body.query

	try:
		# 在线程池中执行同步搜索，避免阻塞事件循环
		result = await asyncio.to_thread(
			searcher.search,
			query=body.query,
			limit=body.limit,
			use_rerank=body.use_rerank,
			debug=body.debug,
		)

		request.state.result_count = len(result["results"])

		return SearchResponse(
			query=result["query"],
			project=body.project,
			results=[
				SearchResultItem(
					rank=r.rank,
					doc_id=r.doc_id,
					chunk_id=r.chunk_id,
					score=r.score,
					content=r.content,
					content_preview=r.content_preview,
					metadata=r.metadata,
				)
				for r in result["results"]
			],
			search_time_ms=result["search_time_ms"],
			rerank_used=result["rerank_used"],
			debug_info=result.get("debug_info"),
		)
	except HTTPException:
		raise
	except Exception as e:
		logger.error(f"搜索错误: {e}")
		raise HTTPException(status_code=500, detail=str(e))


@router.get("/doc/{doc_id}", response_model=DocumentResponse)
async def get_doc(doc_id: str, project: str):
	"""获取文档的所有chunks"""
	searcher = get_searcher(project)

	try:
		chunks = await asyncio.to_thread(searcher.get_doc_chunks, doc_id)
		if not chunks:
			raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")

		full_content = "\n\n".join([c["content"] for c in chunks])

		return DocumentResponse(
			doc_id=doc_id,
			project=project,
			chunk_count=len(chunks),
			full_content=full_content,
			chunks=chunks,
			metadata=chunks[0]["metadata"] if chunks else {},
		)
	except HTTPException:
		raise
	except Exception as e:
		logger.error(f"获取文档错误: {e}")
		raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects")
async def list_projects():
	"""列出所有可用项目"""
	from ..app import get_project_config, get_searchers

	searchers = get_searchers()
	project_config = get_project_config()

	projects = []
	for name in project_config.project_names:
		proj = project_config.get_project(name)
		projects.append(
			{
				"name": name,
				"collection": proj["collection"],
				"description": proj.get("description", ""),
				"available": name in searchers,
			}
		)
	return {"projects": projects}
