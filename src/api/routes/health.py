"""Health check route"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
	"""Health check"""
	# Searchers injected in app.py
	from ..app import get_searchers

	searchers = get_searchers()
	return {"status": "ok", "projects": list(searchers.keys())}
