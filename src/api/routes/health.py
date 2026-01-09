"""健康检查路由"""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
	"""健康检查"""
	# 这里会在app.py中注入searchers
	from ..app import get_searchers

	searchers = get_searchers()
	return {"status": "ok", "projects": list(searchers.keys())}
