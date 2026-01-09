"""索引构建器 - 带速率限制和断点续传"""

import hashlib
import json
import logging
import os
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

import voyageai
from fastembed import SparseTextEmbedding
from qdrant_client import QdrantClient, models
from qdrant_client.models import (
	Distance,
	HnswConfigDiff,
	OptimizersConfigDiff,
	PointStruct,
	SparseVectorParams,
	VectorParams,
)

from ..core.config import Settings
from ..document.chunker_base import Chunk
from .rate_limiter import RateLimiter

logger = logging.getLogger(__name__)


class VoyageIndexer:
	"""
	Voyage RAG索引构建器

	功能:
	- RPM/TPM速率限制
	- 断点续传
	- 进度保存和恢复

	向量配置:
	- dense: voyage-code-3, 1024维
	- sparse: Qdrant/bm25
	"""

	DENSE_DIM = 1024  # voyage-code-3 维度

	def __init__(
		self,
		settings: Settings,
		collection_name: str,
		checkpoint_dir: Path | str | None = None,
	):
		self.settings = settings
		self.collection_name = collection_name
		self.batch_size = settings.batch_size

		# 初始化Voyage客户端
		self.voyage_client = voyageai.Client(api_key=settings.voyage_api_key)

		# 初始化速率限制器
		self.rate_limiter = RateLimiter(
			rpm=settings.voyage_rpm_limit,
			tpm=settings.voyage_tpm_limit,
		)
		logger.info(
			f"速率限制: {settings.voyage_rpm_limit} RPM, {settings.voyage_tpm_limit} TPM"
		)

		# 初始化BM25稀疏编码器
		logger.info("初始化BM25 sparse encoder...")
		self.sparse_encoder = SparseTextEmbedding(model_name="Qdrant/bm25")

		# 初始化Qdrant客户端
		logger.info(f"连接到 Qdrant 服务: {settings.qdrant_url}")
		self.qdrant = QdrantClient(url=settings.qdrant_url)

		# Checkpoint目录
		if checkpoint_dir is None:
			checkpoint_dir = Path("./storage/checkpoints")
		self.checkpoint_dir = Path(checkpoint_dir)
		self.checkpoint_dir.mkdir(parents=True, exist_ok=True)

	def _get_checkpoint_path(self, job_id: str) -> Path:
		"""获取checkpoint文件路径"""
		return self.checkpoint_dir / f"{job_id}.checkpoint.json"

	def _save_checkpoint(self, job_id: str, checkpoint_data: Dict) -> None:
		"""保存checkpoint"""
		checkpoint_path = self._get_checkpoint_path(job_id)
		with open(checkpoint_path, "w", encoding="utf-8") as f:
			json.dump(checkpoint_data, f, ensure_ascii=False, indent=2)
		logger.info(f"Checkpoint已保存: {checkpoint_path}")

	def _load_checkpoint(self, job_id: str) -> Optional[Dict]:
		"""加载checkpoint"""
		checkpoint_path = self._get_checkpoint_path(job_id)
		if not checkpoint_path.exists():
			return None

		try:
			with open(checkpoint_path, "r", encoding="utf-8") as f:
				checkpoint = json.load(f)
			logger.info(f"加载checkpoint: {checkpoint_path}")
			return checkpoint
		except Exception as e:
			logger.warning(f"加载checkpoint失败: {e}")
			return None

	def _delete_checkpoint(self, job_id: str) -> None:
		"""删除checkpoint"""
		checkpoint_path = self._get_checkpoint_path(job_id)
		if checkpoint_path.exists():
			os.remove(checkpoint_path)
			logger.info(f"Checkpoint已删除: {checkpoint_path}")

	def _create_collection(self, recreate: bool = False) -> None:
		"""创建或重建collection（优化参数）"""
		if self.qdrant.collection_exists(self.collection_name):
			if recreate:
				logger.info(f"删除现有collection: {self.collection_name}")
				self.qdrant.delete_collection(self.collection_name)
			else:
				logger.info(f"Collection已存在: {self.collection_name}")
				return

		logger.info(f"创建collection: {self.collection_name}")
		self.qdrant.create_collection(
			collection_name=self.collection_name,
			vectors_config={
				"dense": VectorParams(
					size=self.DENSE_DIM,
					distance=Distance.COSINE,
					hnsw_config=HnswConfigDiff(
						m=16,
						ef_construct=100,
					),
				),
			},
			sparse_vectors_config={
				"sparse": SparseVectorParams(modifier=models.Modifier.IDF),
			},
			optimizers_config=OptimizersConfigDiff(
				memmap_threshold=20000,
				indexing_threshold=10000,
			),
		)

	def _estimate_tokens(self, text: str) -> int:
		"""
		估算文本的token数

		不同语言的 token 密度不同：
		- 英文/代码：约 4 字符/token
		- 中文/日文：约 1.5-2 字符/token

		这里用 len//2 作为保守估计，适用于混合内容
		"""
		return len(text) // 2

	def _format_time(self, seconds: float) -> str:
		"""格式化时间为 mm:ss 或 hh:mm:ss"""
		if seconds < 3600:
			return f"{int(seconds // 60):02d}:{int(seconds % 60):02d}"
		hours = int(seconds // 3600)
		minutes = int((seconds % 3600) // 60)
		secs = int(seconds % 60)
		return f"{hours:02d}:{minutes:02d}:{secs:02d}"

	def _create_token_safe_batches(
		self, texts: List[str], max_tokens: int = 50000, max_batch_size: int = 1000
	) -> List[List[str]]:
		"""创建不超过 token 和文档数量限制的批次

		Voyage API 限制：
		- 单批最多 120000 tokens
		- 单批最多 1000 个文档

		注：估算用 len//2（中文友好），max_tokens=50000 留 60% 余量
		"""
		batches = []
		current_batch = []
		current_tokens = 0

		for text in texts:
			text_tokens = self._estimate_tokens(text)
			batch_full = (
				(current_tokens + text_tokens > max_tokens) or
				(len(current_batch) >= max_batch_size)
			)
			if batch_full and current_batch:
				batches.append(current_batch)
				current_batch = [text]
				current_tokens = text_tokens
			else:
				current_batch.append(text)
				current_tokens += text_tokens

		if current_batch:
			batches.append(current_batch)

		return batches

	def _embed_dense_with_rate_limit(
		self,
		texts: List[str],
		on_batch_complete: Optional[Callable[[int, List], None]] = None,
	) -> List[List[float]]:
		"""生成dense embedding（带速率限制）"""
		embeddings = []
		batches = self._create_token_safe_batches(texts)
		total_batches = len(batches)
		start_time = time.time()

		for batch_num, batch in enumerate(batches, 1):
			estimated_tokens = sum(self._estimate_tokens(t) for t in batch)
			self.rate_limiter.acquire(estimated_tokens)

			# 计算进度信息
			progress = batch_num / total_batches * 100
			elapsed = time.time() - start_time
			if batch_num > 1:
				eta = elapsed / (batch_num - 1) * (total_batches - batch_num)
				eta_str = self._format_time(eta)
			else:
				eta_str = "--:--"

			logger.info(
				f"  [{progress:5.1f}%] batch {batch_num}/{total_batches} ({len(batch)} chunks) | "
				f"elapsed {self._format_time(elapsed)} | ETA {eta_str}"
			)

			try:
				result = self.voyage_client.embed(
					batch,
					model=self.settings.voyage_embed_model,
					input_type="document",
				)
				embeddings.extend(result.embeddings)

				if on_batch_complete and batch_num % 50 == 0:
					on_batch_complete(batch_num, embeddings)

			except Exception as e:
				logger.error(f"Batch {batch_num} embedding失败: {e}")
				raise

		return embeddings

	def _embed_sparse(self, texts: List[str]) -> List:
		"""生成sparse embedding (BM25)"""
		return list(self.sparse_encoder.embed(texts))

	def _generate_stable_job_id(self, chunks: List[Chunk]) -> str:
		"""根据chunks内容生成稳定的job_id"""
		sample_ids = [c.id for c in chunks[:10]]
		content = f"{len(chunks)}_{self.collection_name}_{'_'.join(sample_ids)}"
		hash_value = hashlib.md5(content.encode()).hexdigest()[:12]
		return f"index_{hash_value}"

	def build_index(
		self,
		chunks: List[Chunk],
		recreate: bool = True,
		resume_from_checkpoint: bool = True,
		job_id: Optional[str] = None,
		progress_callback: Optional[Callable] = None,
	) -> Dict:
		"""构建索引（支持断点续传）"""
		if job_id is None:
			job_id = self._generate_stable_job_id(chunks)

		logger.info(f"Job ID: {job_id}")

		# 尝试加载checkpoint
		checkpoint = None
		if resume_from_checkpoint:
			checkpoint = self._load_checkpoint(job_id)

		stats = {
			"job_id": job_id,
			"total_chunks": len(chunks),
			"dense_time": 0,
			"sparse_time": 0,
			"index_time": 0,
			"total_tokens": 0,
			"resumed": checkpoint is not None,
		}

		logger.info(f"开始构建索引，共 {len(chunks)} 个块")

		texts = [chunk.content for chunk in chunks]
		total_chars = sum(len(t) for t in texts)
		stats["total_tokens"] = total_chars // 4

		# 从checkpoint恢复
		dense_embeddings = []
		sparse_embeddings = []

		if checkpoint:
			logger.info("从checkpoint恢复...")
			dense_embeddings = checkpoint.get("dense_embeddings", [])
			sparse_embeddings = checkpoint.get("sparse_embeddings", [])
			stats["dense_time"] = checkpoint.get("dense_time", 0)
			stats["sparse_time"] = checkpoint.get("sparse_time", 0)

			logger.info(f"已有 {len(dense_embeddings)} 个dense embeddings")

			if len(dense_embeddings) >= len(texts):
				logger.info("Embedding已全部完成，直接进入索引写入阶段")
			else:
				logger.info(f"继续处理剩余 {len(texts) - len(dense_embeddings)} 个文档")

			self._create_collection(recreate=False)
		else:
			self._create_collection(recreate=recreate)

		# Dense Embedding
		if len(dense_embeddings) < len(texts):
			remaining_texts = texts[len(dense_embeddings):]
			logger.info(f"生成Dense Embedding (voyage-code-3)... 共 {len(remaining_texts)} 个文档")
			start_time = time.time()

			def on_batch_complete(batch_num: int, new_embeddings: List):
				all_embeddings = dense_embeddings + new_embeddings
				self._save_checkpoint(
					job_id,
					{
						"dense_embeddings": all_embeddings,
						"sparse_embeddings": sparse_embeddings,
						"dense_time": stats["dense_time"] + (time.time() - start_time),
						"sparse_time": stats["sparse_time"],
						"timestamp": datetime.now().isoformat(),
					},
				)

			try:
				new_embeddings = self._embed_dense_with_rate_limit(
					remaining_texts, on_batch_complete=on_batch_complete
				)
				dense_embeddings.extend(new_embeddings)

				dense_time = time.time() - start_time
				stats["dense_time"] += dense_time
				logger.info(
					f"Dense Embedding完成, 本次耗时 {dense_time:.1f}s, "
					f"累计 {stats['dense_time']:.1f}s"
				)

			except KeyboardInterrupt:
				logger.warning("用户中断，保存checkpoint...")
				self._save_checkpoint(
					job_id,
					{
						"dense_embeddings": dense_embeddings,
						"sparse_embeddings": sparse_embeddings,
						"dense_time": stats["dense_time"] + (time.time() - start_time),
						"sparse_time": stats["sparse_time"],
						"interrupted": True,
						"timestamp": datetime.now().isoformat(),
					},
				)
				logger.info(f"Checkpoint已保存，已完成 {len(dense_embeddings)}/{len(texts)} embeddings")
				raise

			except Exception as e:
				logger.error(f"Dense Embedding出错: {e}")
				self._save_checkpoint(
					job_id,
					{
						"dense_embeddings": dense_embeddings,
						"sparse_embeddings": sparse_embeddings,
						"dense_time": stats["dense_time"] + (time.time() - start_time),
						"sparse_time": stats["sparse_time"],
						"error": str(e),
						"timestamp": datetime.now().isoformat(),
					},
				)
				raise

		# Sparse Embedding
		if len(sparse_embeddings) == 0:
			logger.info("生成Sparse Embedding (BM25)...")
			start_time = time.time()
			sparse_embeddings = self._embed_sparse(texts)
			stats["sparse_time"] = time.time() - start_time
			logger.info(f"Sparse Embedding完成, 耗时 {stats['sparse_time']:.1f}s")

		# 插入Qdrant
		logger.info("插入数据到Qdrant...")
		start_time = time.time()
		points = []

		for i, chunk in enumerate(chunks):
			sparse_emb = sparse_embeddings[i]

			payload = {
				"chunk_id": chunk.id,
				"doc_id": chunk.doc_id,
				"chunk_index": chunk.chunk_index,
				"content": chunk.content,
				"category": chunk.metadata.get("category", ""),
				"file_name": chunk.metadata.get("file_name", ""),
				"path_hierarchy": chunk.metadata.get("path_hierarchy", []),
			}

			point = PointStruct(
				id=str(uuid.uuid4()),
				vector={
					"dense": dense_embeddings[i],
					"sparse": models.SparseVector(
						indices=sparse_emb.indices.tolist(),
						values=sparse_emb.values.tolist(),
					),
				},
				payload=payload,
			)
			points.append(point)

			if progress_callback and (i + 1) % 100 == 0:
				progress_callback(
					i + 1, len(chunks), f"处理: {chunk.metadata.get('file_name', '')}"
				)

		# 批量插入
		batch_size = 1000
		logger.info(f"插入 {len(points)} 个点，batch_size={batch_size}")
		for i in range(0, len(points), batch_size):
			batch = points[i : i + batch_size]
			self.qdrant.upsert(
				collection_name=self.collection_name,
				points=batch,
				wait=True,
			)
			logger.info(f"  已插入 {min(i + batch_size, len(points))}/{len(points)} 点")

		stats["index_time"] = time.time() - start_time
		logger.info(f"索引构建完成, 耗时 {stats['index_time']:.1f}s")

		# 删除checkpoint
		self._delete_checkpoint(job_id)

		return stats

	def get_collection_info(self) -> Optional[Dict]:
		"""获取collection信息"""
		if not self.qdrant.collection_exists(self.collection_name):
			return None

		info = self.qdrant.get_collection(self.collection_name)
		return {
			"name": self.collection_name,
			"points_count": info.points_count,
			"status": info.status.value,
		}
