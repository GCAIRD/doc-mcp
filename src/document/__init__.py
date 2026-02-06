from .loader import Document, DocumentLoader
from .chunker_base import Chunk, BaseChunker
from .chunker_markdown import MarkdownChunker
from .chunker_javadoc import JavaDocChunker


def get_chunker(chunker_type: str, **kwargs) -> BaseChunker:
	"""Factory function"""
	chunkers = {
		'markdown': MarkdownChunker,
		'javadoc': JavaDocChunker,
	}
	if chunker_type not in chunkers:
		raise ValueError(f"Unknown chunker type: {chunker_type}. Available: {list(chunkers.keys())}")
	return chunkers[chunker_type](**kwargs)


__all__ = [
	'Document', 'DocumentLoader',
	'Chunk', 'BaseChunker',
	'MarkdownChunker', 'JavaDocChunker',
	'get_chunker'
]
