"""Document loader"""

import re
import logging
from pathlib import Path
from typing import Dict, Iterator, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


def clean_html_from_markdown(content: str) -> str:
	"""
	Clean HTML tags and CSS styles from Markdown

	Keep:
	- Code blocks (```...```)
	- Image tags ![...](...) and <img>
	- Link tags [...](...) and <a>

	Remove:
	- <span style="...">text</span> → text
	- <br> → newline
	- Other meaningless HTML tags
	"""
	# Protect code blocks
	code_blocks = []

	def save_code_block(match):
		code_blocks.append(match.group(0))
		return f"__CODE_BLOCK_{len(code_blocks) - 1}__"

	content = re.sub(r"```[\s\S]*?```", save_code_block, content)

	# Remove <span> tags but keep content
	content = re.sub(r"<span[^>]*>([^<]*)</span>", r"\1", content)

	# Handle nested spans (multiple passes)
	for _ in range(5):
		prev = content
		content = re.sub(r"<span[^>]*>([^<]*)</span>", r"\1", content)
		if content == prev:
			break

	# Remove remaining empty or complex spans
	content = re.sub(r"<span[^>]*>\s*</span>", "", content)
	content = re.sub(r"<span[^>]*>", "", content)
	content = re.sub(r"</span>", "", content)

	# <br> → newline
	content = re.sub(r"<br\s*/?>", "\n", content)

	# Remove Word export attributes
	content = re.sub(r'\s*data-ccp-props="[^"]*"', "", content)

	# Clean style attributes
	content = re.sub(r'\s*style="[^"]*"', "", content)
	content = re.sub(r'\s*class="[^"]*"', "", content)

	# Clean excess whitespace
	content = re.sub(r"\n{3,}", "\n\n", content)
	content = re.sub(r" {2,}", " ", content)

	# Restore code blocks
	for i, block in enumerate(code_blocks):
		content = content.replace(f"__CODE_BLOCK_{i}__", block)

	return content.strip()


@dataclass
class Document:
	"""Document object"""

	id: str
	content: str
	metadata: Dict = field(default_factory=dict)


class DocumentLoader:
	"""
	Load Markdown documents from directory, auto-extract directory structure as metadata

	Directory structure example:
	raw_data/
	├── apis/          # category="api"
	├── docs/          # category="doc"
	└── demos/         # category="demo"

	Extracted metadata:
	- category: api/doc/demo
	- path_hierarchy: full path hierarchy list
	- file_name: filename (without extension)
	"""

	CATEGORY_MAP = {
		"apis": "api",
		"docs": "doc",
		"demos": "demo",
	}

	def __init__(self, base_dir: str | Path):
		self.base_dir = Path(base_dir)
		if not self.base_dir.exists():
			raise ValueError(f"Directory not found: {base_dir}")

	def _extract_metadata(self, file_path: Path) -> Dict:
		"""Extract metadata from file path"""
		rel_path = file_path.relative_to(self.base_dir)
		parts = list(rel_path.parts)

		metadata = {
			"file_path": str(file_path),
			"relative_path": str(rel_path),
			"file_name": file_path.stem,
			"path_hierarchy": parts[:-1],
		}

		if parts:
			top_dir = parts[0].lower()
			metadata["category"] = self.CATEGORY_MAP.get(top_dir, top_dir)

		return metadata

	def load_file(self, file_path: Path) -> Optional[Document]:
		"""Load single file"""
		try:
			content = file_path.read_text(encoding="utf-8")
			if not content.strip():
				return None

			content = clean_html_from_markdown(content)
			metadata = self._extract_metadata(file_path)

			# Generate document ID
			doc_id = metadata["relative_path"].replace("\\", "/").replace("/", "_")
			for ext in [".md", ".java"]:
				doc_id = doc_id.replace(ext, "")

			return Document(id=doc_id, content=content, metadata=metadata)
		except Exception as e:
			logger.warning(f"Failed to load file {file_path}: {e}")
			return None

	def load_directory(
		self,
		subdirs: Optional[List[str]] = None,
		extensions: List[str] | None = None,
	) -> Iterator[Document]:
		"""Load documents from directory"""
		if extensions is None:
			extensions = [".md", ".java"]

		search_dirs = []
		if subdirs:
			for subdir in subdirs:
				d = self.base_dir / subdir
				if d.exists():
					search_dirs.append(d)
		else:
			search_dirs = [self.base_dir]

		total_count = 0
		for search_dir in search_dirs:
			for ext in extensions:
				for file_path in search_dir.rglob(f"*{ext}"):
					if not file_path.is_file():
						continue
					doc = self.load_file(file_path)
					if doc:
						total_count += 1
						yield doc

		logger.info(f"Load complete, {total_count} documents total")

	def load_all(self, subdirs: Optional[List[str]] = None) -> List[Document]:
		"""Load all documents to list"""
		return list(self.load_directory(subdirs))
