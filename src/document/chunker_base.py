"""Document chunker base class"""

import re
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Iterator, List

from .loader import Document

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
	"""Document chunk"""

	id: str
	doc_id: str
	chunk_index: int
	content: str
	metadata: Dict = field(default_factory=dict)


class BaseChunker(ABC):
	"""
	Chunker base class

	Provides shared splitting logic:
	- Split by headers
	- Protected code block splitting
	- Find best break points
	"""

	def __init__(
		self,
		chunk_size: int = 2000,
		chunk_overlap: int = 200,
		min_chunk_size: int = 100,
	):
		self.chunk_size = chunk_size
		self.chunk_overlap = chunk_overlap
		self.min_chunk_size = min_chunk_size

	@abstractmethod
	def chunk_document(self, doc: Document) -> Iterator[Chunk]:
		"""Chunk a single document (subclass implements)"""
		pass

	def chunk_documents(self, docs: List[Document]) -> List[Chunk]:
		"""Batch chunk documents"""
		chunks = []
		for doc in docs:
			for chunk in self.chunk_document(doc):
				chunks.append(chunk)
		logger.info(f"Chunking complete: {len(docs)} docs -> {len(chunks)} chunks")
		return chunks

	# ===== Shared utility methods =====

	def split_by_headers(self, content: str, level: str = r"#{1,6}") -> List[str]:
		"""Split by Markdown headers"""
		pattern = rf"^({level}\s+.+)$"
		parts = re.split(pattern, content, flags=re.MULTILINE)

		sections = []
		current = ""
		for part in parts:
			if re.match(rf"^{level}\s+", part):
				if current.strip():
					sections.append(current.strip())
				current = part + "\n"
			else:
				current += part

		if current.strip():
			sections.append(current.strip())

		return sections if sections else [content]

	def split_protected(self, text: str) -> List[str]:
		"""
		Split while protecting code blocks

		1. Identify code block positions
		2. Only split outside code blocks
		3. Keep long code blocks intact (allow exceeding chunk_size)
		"""
		if len(text) <= self.chunk_size:
			return [text]

		# Find all code block positions
		code_blocks = list(re.finditer(r"```[\s\S]*?```", text))

		# Split text into: regular segments and code blocks
		segments: List[tuple] = []
		pos = 0
		for block in code_blocks:
			if pos < block.start():
				segments.append((pos, block.start(), False))
			segments.append((block.start(), block.end(), True))
			pos = block.end()
		if pos < len(text):
			segments.append((pos, len(text), False))

		if not segments:
			return self._simple_split(text)

		chunks = []
		current_chunk = ""

		for start, end, is_code in segments:
			segment_text = text[start:end]

			if is_code:
					# Code block: keep intact
				if current_chunk:
					if len(current_chunk) + len(segment_text) <= self.chunk_size * 1.5:
						current_chunk += segment_text
					else:
						if current_chunk.strip():
							chunks.append(current_chunk.strip())
						current_chunk = segment_text
				else:
					current_chunk = segment_text
			else:
				# Regular text: can split
				if len(current_chunk) + len(segment_text) <= self.chunk_size:
					current_chunk += segment_text
				else:
					remaining = segment_text
					while remaining:
						space_left = self.chunk_size - len(current_chunk)
						if len(remaining) <= space_left:
							current_chunk += remaining
							remaining = ""
						else:
							cut_point = self._find_break_point(remaining, space_left)
							current_chunk += remaining[:cut_point]
							if current_chunk.strip():
								chunks.append(current_chunk.strip())
							current_chunk = ""
							remaining = remaining[cut_point:]

		if current_chunk.strip() and len(current_chunk.strip()) >= self.min_chunk_size:
			chunks.append(current_chunk.strip())

		return chunks if chunks else [text]

	def _find_break_point(self, text: str, max_pos: int) -> int:
		"""Find best break point"""
		for sep in ["\n\n", "\n", "。", "."]:
			pos = text.rfind(sep, 0, max_pos)
			if pos > max_pos // 2:
				return pos + len(sep)
		return max_pos

	def _simple_split(self, text: str) -> List[str]:
		"""Simple size-based split (when no code blocks)"""
		chunks = []
		start = 0
		while start < len(text):
			end = start + self.chunk_size
			if end < len(text):
				for sep in ["\n\n", "\n", "。", "."]:
					last_sep = text.rfind(sep, start + self.chunk_size // 2, end)
					if last_sep > start + self.chunk_size // 2:
						end = last_sep + len(sep)
						break
			chunk = text[start:end].strip()
			if chunk and len(chunk) >= self.min_chunk_size:
				chunks.append(chunk)
			start = end - self.chunk_overlap
			if start >= len(text):
				break
		return chunks
