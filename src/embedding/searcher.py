"""RAG搜索器 - Dense + Sparse RRF + Rerank"""

import logging
import time
from dataclasses import dataclass
from typing import Dict, List, Tuple

import voyageai
from fastembed import SparseTextEmbedding
from lingua import Language, LanguageDetectorBuilder
from qdrant_client import QdrantClient, models

from ..core.config import ProjectConfig, Settings

logger = logging.getLogger(__name__)

# 语言代码映射
LANG_CODE_MAP = {
	"zh": Language.CHINESE,
	"en": Language.ENGLISH,
	"ja": Language.JAPANESE,
}
LANG_REVERSE_MAP = {v: k for k, v in LANG_CODE_MAP.items()}


@dataclass
class SearchResult:
	"""搜索结果"""

	rank: int
	doc_id: str
	chunk_id: str
	score: float
	content: str
	content_preview: str
	metadata: Dict


class VoyageSearcher:
	"""
	Voyage RAG搜索器

	搜索流程:
	1. Query Embedding (voyage-code-3 + BM25)
	2. 混合搜索 (dense + sparse prefetch)
	   - query 语言与文档主语言匹配: Dense + BM25 RRF 融合
	   - query 语言与文档主语言不匹配: 仅 Dense（跨语言场景 BM25 无效）
	3. Voyage Rerank (rerank-2.5)
	4. 返回Top-K结果

	语言检测使用 lingua-py，支持 zh/en/ja。
	文档主语言通过 DOC_LANGUAGE 环境变量配置。
	"""

	# 类级别共享语言检测器（只初始化一次）
	_lang_detector = None

	@classmethod
	def _get_lang_detector(cls):
		"""获取共享的语言检测器（延迟初始化）"""
		if cls._lang_detector is None:
			cls._lang_detector = (
				LanguageDetectorBuilder.from_languages(
					Language.CHINESE, Language.ENGLISH, Language.JAPANESE
				)
				.with_minimum_relative_distance(0.25)  # 提高短文本准确度
				.build()
			)
		return cls._lang_detector

	def __init__(
		self,
		settings: Settings,
		project_config: ProjectConfig,
		collection_name: str,
	):
		self.settings = settings
		self.project_config = project_config
		self.collection_name = collection_name
		self.prefetch_limit = project_config.prefetch_limit
		self.rerank_top_k = project_config.rerank_top_k
		self.doc_language = settings.doc_language

		# 初始化Voyage客户端
		self.voyage_client = voyageai.Client(api_key=settings.voyage_api_key)

		# 初始化BM25稀疏编码器
		logger.info("初始化BM25 sparse encoder...")
		self.sparse_encoder = SparseTextEmbedding(model_name="Qdrant/bm25")

		# 初始化Qdrant客户端
		logger.info(f"连接到 Qdrant 服务: {settings.qdrant_url}")
		self.qdrant = QdrantClient(url=settings.qdrant_url)

		logger.info(f"文档主语言: {self.doc_language}")

	def _detect_language(self, text: str) -> str:
		"""
		检测文本语言

		Returns:
			语言代码: 'zh', 'en', 'ja', 或 'unknown'
		"""
		detector = self._get_lang_detector()
		detected = detector.detect_language_of(text)
		return LANG_REVERSE_MAP.get(detected, "unknown")

	def _get_query_embeddings(self, query: str):
		"""获取query的dense和sparse embedding"""
		# Dense
		dense_result = self.voyage_client.embed(
			[query],
			model=self.settings.voyage_embed_model,
			input_type="query",
		)
		dense_vector = dense_result.embeddings[0]
		token_usage = getattr(dense_result, "total_tokens", 0)

		# Sparse
		sparse_result = list(self.sparse_encoder.embed([query]))[0]
		sparse_vector = models.SparseVector(
			indices=sparse_result.indices.tolist(),
			values=sparse_result.values.tolist(),
		)

		return dense_vector, sparse_vector, token_usage

	def _hybrid_search(
		self, query: str, dense_vector, sparse_vector, limit: int
	) -> Tuple[List[Dict], str, str]:
		"""
		混合搜索：根据 query 语言动态选择策略

		- query 语言与文档主语言匹配: Dense + BM25 RRF 融合
		- query 语言与文档主语言不匹配: 仅 Dense（跨语言场景 BM25 无效）

		Returns:
			(candidates, fusion_mode, detected_lang)
		"""
		detected_lang = self._detect_language(query)
		use_bm25 = detected_lang == self.doc_language

		if use_bm25:
			# 语言匹配：RRF 融���
			prefetch = [
				models.Prefetch(query=dense_vector, using="dense", limit=limit),
				models.Prefetch(query=sparse_vector, using="sparse", limit=limit),
			]
			fusion_mode = "rrf"
		else:
			# 语言不匹配：仅 Dense（跨语言检索）
			prefetch = [
				models.Prefetch(query=dense_vector, using="dense", limit=limit),
			]
			fusion_mode = "dense_only"

		results = self.qdrant.query_points(
			collection_name=self.collection_name,
			prefetch=prefetch,
			query=models.FusionQuery(fusion=models.Fusion.RRF),
			limit=limit,
			with_payload=True,
		)

		candidates = []
		for point in results.points:
			candidates.append(
				{
					"doc_id": point.payload.get("doc_id", ""),
					"chunk_id": point.payload.get("chunk_id", ""),
					"content": point.payload.get("content", ""),
					"rrf_score": point.score,
					"metadata": {
						"category": point.payload.get("category", ""),
						"file_name": point.payload.get("file_name", ""),
						"path_hierarchy": point.payload.get("path_hierarchy", []),
					},
				}
			)

		return candidates, fusion_mode, detected_lang

	def _rerank(
		self, query: str, candidates: List[Dict], top_k: int
	) -> Tuple[List[Dict], int]:
		"""Voyage Rerank"""
		if not candidates:
			return [], 0

		docs = [c["content"] for c in candidates]

		rerank_result = self.voyage_client.rerank(
			query=query,
			documents=docs,
			model=self.settings.voyage_rerank_model,
			top_k=min(top_k, len(docs)),
		)

		token_usage = getattr(rerank_result, "total_tokens", 0)

		reranked = []
		for item in rerank_result.results:
			candidate = candidates[item.index]
			candidate["rerank_score"] = item.relevance_score
			candidate["original_rank"] = item.index + 1
			reranked.append(candidate)

		return reranked, token_usage

	def search(
		self,
		query: str,
		limit: int | None = None,
		use_rerank: bool = True,
		debug: bool = False,
	) -> Dict:
		"""执行RAG搜索"""
		if limit is None:
			limit = self.project_config.default_limit

		start_time = time.time()
		prefetch_limit = self.prefetch_limit if use_rerank else limit

		# 获取embeddings并搜索
		dense_vector, sparse_vector, embed_tokens = self._get_query_embeddings(query)
		candidates, fusion_mode, detected_lang = self._hybrid_search(
			query, dense_vector, sparse_vector, prefetch_limit
		)

		# Rerank
		rerank_tokens = 0
		if use_rerank and candidates:
			candidates, rerank_tokens = self._rerank(query, candidates, limit)
		else:
			candidates = candidates[:limit]

		# 构建结果
		results = []
		for rank, c in enumerate(candidates):
			score = c.get("rerank_score", c.get("rrf_score", 0))
			content = c["content"]
			preview = content[:300] + "..." if len(content) > 300 else content

			results.append(
				SearchResult(
					rank=rank + 1,
					doc_id=c["doc_id"],
					chunk_id=c["chunk_id"],
					score=score,
					content=content,
					content_preview=preview,
					metadata=c["metadata"],
				)
			)

		search_time = (time.time() - start_time) * 1000

		response = {
			"query": query,
			"results": results,
			"search_time_ms": round(search_time, 2),
			"rerank_used": use_rerank,
			"fusion_mode": fusion_mode,
			"detected_lang": detected_lang,
			"doc_language": self.doc_language,
		}

		if debug:
			chunk_lengths = [len(c["content"]) for c in candidates]
			debug_info = {
				"token_usage": {
					"embed_tokens": embed_tokens,
					"rerank_tokens": rerank_tokens,
					"total_tokens": embed_tokens + rerank_tokens,
				},
				"retrieval_stats": {
					"fusion_mode": fusion_mode,
					"detected_lang": detected_lang,
					"doc_language": self.doc_language,
					"prefetch_limit": prefetch_limit,
					"rerank_top_k": limit if use_rerank else None,
					"final_limit": limit,
					"candidates_count": len(candidates),
					"avg_chunk_length": (
						round(sum(chunk_lengths) / len(chunk_lengths))
						if chunk_lengths
						else 0
					),
				},
			}
			response["debug_info"] = debug_info

		return response

	def get_doc_chunks(self, doc_id: str) -> List[Dict]:
		"""根据doc_id获取所有相关chunks"""
		results = self.qdrant.scroll(
			collection_name=self.collection_name,
			scroll_filter=models.Filter(
				must=[
					models.FieldCondition(
						key="doc_id", match=models.MatchValue(value=doc_id)
					)
				]
			),
			limit=100,
			with_payload=True,
		)

		chunks = []
		for point in results[0]:
			chunks.append(
				{
					"chunk_id": point.payload.get("chunk_id", ""),
					"chunk_index": point.payload.get("chunk_index", 0),
					"content": point.payload.get("content", ""),
					"metadata": {
						"category": point.payload.get("category", ""),
						"file_name": point.payload.get("file_name", ""),
						"path_hierarchy": point.payload.get("path_hierarchy", []),
					},
				}
			)

		chunks.sort(key=lambda x: x["chunk_index"])
		return chunks

	def search_simple(self, query: str, limit: int = 5) -> List[Dict]:
		"""简化搜索接口"""
		result = self.search(query=query, limit=limit, use_rerank=True)

		return [
			{
				"doc_id": r.doc_id,
				"chunk_id": r.chunk_id,
				"score": r.score,
				"content_preview": r.content_preview,
				"metadata": r.metadata,
			}
			for r in result["results"]
		]
