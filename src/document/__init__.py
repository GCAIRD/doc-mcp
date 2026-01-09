from .loader import Document, DocumentLoader
from .chunker_base import Chunk, BaseChunker
from .chunker_markdown import MarkdownChunker
from .chunker_javadoc import JavaDocChunker


def get_chunker(chunker_type: str, **kwargs) -> BaseChunker:
	"""工厂函数"""
	chunkers = {
		'markdown': MarkdownChunker,
		'javadoc': JavaDocChunker,
	}
	if chunker_type not in chunkers:
		raise ValueError(f"未知 chunker 类型: {chunker_type}. 可用: {list(chunkers.keys())}")
	return chunkers[chunker_type](**kwargs)


__all__ = [
	'Document', 'DocumentLoader',
	'Chunk', 'BaseChunker',
	'MarkdownChunker', 'JavaDocChunker',
	'get_chunker'
]
