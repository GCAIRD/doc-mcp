"""Search API routes"""

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
	"""Get searcher for project"""
	from ..app import get_searchers

	searchers = get_searchers()
	if project not in searchers:
		available = list(searchers.keys())
		raise HTTPException(
			status_code=400,
			detail=f"Project '{project}' not found. Available: {available}",
		)
	return searchers[project]


@router.post("/search", response_model=SearchResponse)
async def search(request: Request, body: SearchRequest):
	"""Execute RAG search"""
	searcher = get_searcher(body.project)

	# Store in request.state for logging
	request.state.project = body.project
	request.state.query = body.query

	try:
		# Run sync search in thread pool to avoid blocking event loop
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
		logger.error(f"Search error: {e}")
		raise HTTPException(status_code=500, detail=str(e))


@router.get("/doc/{doc_id}", response_model=DocumentResponse)
async def get_doc(doc_id: str, project: str):
	"""Get all chunks for a document"""
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
		logger.error(f"Get document error: {e}")
		raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects")
async def list_projects():
	"""List all available projects"""
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
