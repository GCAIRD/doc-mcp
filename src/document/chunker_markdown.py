"""Markdown universal chunker"""

from typing import Iterator

from .chunker_base import BaseChunker, Chunk
from .loader import Document


class MarkdownChunker(BaseChunker):
	"""
	Markdown document chunker

	Strategy:
	1. Split by headers (#)
	2. Secondary split by char count for long sections
	3. Protect code block integrity
	"""

	def chunk_document(self, doc: Document) -> Iterator[Chunk]:
		"""Chunk the document"""
		# Split by headers
		sections = self.split_by_headers(doc.content)

		chunk_index = 0
		for section in sections:
			# Split by size, protect code blocks
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
