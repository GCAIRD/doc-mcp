"""文档分块器基类"""

import re
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Iterator, List

from .loader import Document

logger = logging.getLogger(__name__)


@dataclass
class Chunk:
	"""文档块"""

	id: str
	doc_id: str
	chunk_index: int
	content: str
	metadata: Dict = field(default_factory=dict)


class BaseChunker(ABC):
	"""
	分块器基类

	提供共享的切分逻辑：
	- 按标题切分
	- 保护代码块切分
	- 查找最佳断点
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
		"""分块单个文档（子类实现）"""
		pass

	def chunk_documents(self, docs: List[Document]) -> List[Chunk]:
		"""批量分块"""
		chunks = []
		for doc in docs:
			for chunk in self.chunk_document(doc):
				chunks.append(chunk)
		logger.info(f"分块完成: {len(docs)} 文档 -> {len(chunks)} 块")
		return chunks

	# ===== 共享工具方法 =====

	def split_by_headers(self, content: str, level: str = r"#{1,6}") -> List[str]:
		"""按Markdown标题切分"""
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
		保护代码块的切分

		1. 识别代码块位置
		2. 只在代码块外部切分
		3. 超长代码块保持完整（允许超过 chunk_size）
		"""
		if len(text) <= self.chunk_size:
			return [text]

		# 找出所有代码块的位置
		code_blocks = list(re.finditer(r"```[\s\S]*?```", text))

		# 将文本分割成：普通文本段 和 代码块
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
				# 代码块：保持完整
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
				# 普通文本：可以切分
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
		"""找到最佳断点"""
		for sep in ["\n\n", "\n", "。", "."]:
			pos = text.rfind(sep, 0, max_pos)
			if pos > max_pos // 2:
				return pos + len(sep)
		return max_pos

	def _simple_split(self, text: str) -> List[str]:
		"""简单按大小切分（无代码块时使用）"""
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
