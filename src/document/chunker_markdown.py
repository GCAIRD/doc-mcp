"""Markdown 通用分块器"""

from typing import Iterator

from .chunker_base import BaseChunker, Chunk
from .loader import Document


class MarkdownChunker(BaseChunker):
	"""
	Markdown文档分块器

	策略：
	1. 按标题(#)切分主要段落
	2. 段落过长时按字符数二次切分
	3. 保护代码块完整性
	"""

	def chunk_document(self, doc: Document) -> Iterator[Chunk]:
		"""对文档进行分块"""
		# 按标题切分
		sections = self.split_by_headers(doc.content)

		chunk_index = 0
		for section in sections:
			# 按大小切分，保护代码块
			text_chunks = self.split_protected(section)

			for text in text_chunks:
				if len(text.strip()) < self.min_chunk_size:
					continue

				yield Chunk(
					id=f"{doc.id}_chunk{chunk_index}",
					doc_id=doc.id,
					chunk_index=chunk_index,
					content=text,
					metadata={**doc.metadata, "chunk_index": chunk_index},
				)
				chunk_index += 1
