"""JavaDoc API 文档分块器"""

import re
from typing import Iterator

from .chunker_base import BaseChunker, Chunk
from .loader import Document


class JavaDocChunker(BaseChunker):
	"""
	JavaDoc API 文档分块器

	针对 GcExcel 三类文档的特点设计：
	- APIs: JavaDoc 风格，按方法切分
	- Demos: 短小示例，整体保留
	- Docs: 多层标题，保护代码块
	"""

	def chunk_document(self, doc: Document) -> Iterator[Chunk]:
		"""根据文档类型选择分块策略"""
		category = doc.metadata.get("category", "doc")

		if category == "api":
			yield from self._chunk_api(doc)
		elif category == "demo":
			yield from self._chunk_demo(doc)
		else:
			yield from self._chunk_docs(doc)

	def _chunk_api(self, doc: Document) -> Iterator[Chunk]:
		"""
		API 文档分块策略：
		1. 提取类/接口头部信息作为上下文
		2. 按 ### methodName 切分方法详情
		3. 每个方法 chunk 包含类名上下文
		"""
		content = doc.content
		lines = content.split("\n")

		# 提取头部：类名、包名、描述
		header_end = 0
		for i, line in enumerate(lines):
			if "## Method Summary" in line or "## Field Summary" in line:
				header_end = i
				break
			if i > 30:
				header_end = 15
				break

		header = "\n".join(lines[:header_end]).strip()

		# 查找 Method Details 部分
		details_start = None
		for i, line in enumerate(lines):
			if "## Method Details" in line or "## Method Detail" in line:
				details_start = i
				break

		if details_start is None:
			yield from self._chunk_by_size(doc)
			return

		# 切分方法：按 `### methodName` 或 `+ ### methodName`
		methods = []
		current_method = []
		method_pattern = re.compile(r"^\s*\+?\s*###\s+\w+")

		for line in lines[details_start:]:
			if method_pattern.match(line):
				if current_method:
					methods.append("\n".join(current_method).strip())
				current_method = [line]
			else:
				current_method.append(line)

		if current_method:
			methods.append("\n".join(current_method).strip())

		# 如果方法太少，整个文档按大小切分
		if len(methods) <= 2:
			yield from self._chunk_by_size(doc)
			return

		# 按方法分组输出
		chunk_index = 0
		group = []
		group_size = 0

		for method in methods:
			if group_size + len(method) > self.chunk_size and group:
				combined = (
					f"{header}\n\n---\n\n" + "\n\n".join(group)
					if header
					else "\n\n".join(group)
				)
				yield Chunk(
					id=f"{doc.id}_chunk{chunk_index}",
					doc_id=doc.id,
					chunk_index=chunk_index,
					content=combined,
					metadata={
						**doc.metadata,
						"chunk_index": chunk_index,
						"chunk_type": "api_methods",
					},
				)
				chunk_index += 1
				group = []
				group_size = 0

			group.append(method)
			group_size += len(method)

		if group:
			combined = (
				f"{header}\n\n---\n\n" + "\n\n".join(group)
				if header
				else "\n\n".join(group)
			)
			yield Chunk(
				id=f"{doc.id}_chunk{chunk_index}",
				doc_id=doc.id,
				chunk_index=chunk_index,
				content=combined,
				metadata={
					**doc.metadata,
					"chunk_index": chunk_index,
					"chunk_type": "api_methods",
				},
			)

	def _chunk_demo(self, doc: Document) -> Iterator[Chunk]:
		"""Demo 文档：短文档整体保留"""
		if len(doc.content) <= self.chunk_size:
			yield Chunk(
				id=f"{doc.id}_chunk0",
				doc_id=doc.id,
				chunk_index=0,
				content=doc.content,
				metadata={**doc.metadata, "chunk_index": 0, "chunk_type": "demo"},
			)
			return

		yield from self._chunk_by_size(doc)

	def _chunk_docs(self, doc: Document) -> Iterator[Chunk]:
		"""Docs 文档：按 ## 或 ### 标题切分"""
		sections = self.split_by_headers(doc.content, level=r"#{2,3}")

		chunk_index = 0
		for section in sections:
			for text in self.split_protected(section):
				if len(text.strip()) < self.min_chunk_size:
					continue

				yield Chunk(
					id=f"{doc.id}_chunk{chunk_index}",
					doc_id=doc.id,
					chunk_index=chunk_index,
					content=text,
					metadata={
						**doc.metadata,
						"chunk_index": chunk_index,
						"chunk_type": "docs",
					},
				)
				chunk_index += 1

	def _chunk_by_size(self, doc: Document) -> Iterator[Chunk]:
		"""按大小切分（fallback）"""
		chunks_text = self.split_protected(doc.content)

		for i, text in enumerate(chunks_text):
			if len(text.strip()) < self.min_chunk_size:
				continue

			yield Chunk(
				id=f"{doc.id}_chunk{i}",
				doc_id=doc.id,
				chunk_index=i,
				content=text,
				metadata={**doc.metadata, "chunk_index": i},
			)
