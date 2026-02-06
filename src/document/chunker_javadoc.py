"""JavaDoc API document chunker"""

import re
from typing import Iterator

from .chunker_base import BaseChunker, Chunk
from .loader import Document


class JavaDocChunker(BaseChunker):
	"""
	JavaDoc API document chunker

	Designed for GcExcel three document types:
	- APIs: JavaDoc style, split by methods
	- Demos: Short examples, keep whole
	- Docs: Multi-level headers, protect code blocks
	"""

	def chunk_document(self, doc: Document) -> Iterator[Chunk]:
		"""Select chunking strategy based on document type"""
		category = doc.metadata.get("category", "doc")

		if category == "api":
			yield from self._chunk_api(doc)
		elif category == "demo":
			yield from self._chunk_demo(doc)
		else:
			yield from self._chunk_docs(doc)

	def _chunk_api(self, doc: Document) -> Iterator[Chunk]:
		"""
		API document chunking strategy:
		1. Extract class/interface header as context
		2. Split by ### methodName
		3. Each method chunk includes class context
		"""
		content = doc.content
		lines = content.split("\n")

		# Extract header: class name, package, description
		header_end = 0
		for i, line in enumerate(lines):
			if "## Method Summary" in line or "## Field Summary" in line:
				header_end = i
				break
			if i > 30:
				header_end = 15
				break

		header = "\n".join(lines[:header_end]).strip()

		# Find Method Details section
		details_start = None
		for i, line in enumerate(lines):
			if "## Method Details" in line or "## Method Detail" in line:
				details_start = i
				break

		if details_start is None:
			yield from self._chunk_by_size(doc)
			return

		# Split methods by `### methodName` or `+ ### methodName`
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

		# If too few methods, chunk by size
		if len(methods) <= 2:
			yield from self._chunk_by_size(doc)
			return

		# Group methods and output
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
		"""Demo document: keep short docs whole"""
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
		"""Docs document: split by ## or ### headers"""
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
		"""Chunk by size (fallback)"""
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
