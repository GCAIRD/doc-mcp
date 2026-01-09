"""文档加载器"""

import re
import logging
from pathlib import Path
from typing import Dict, Iterator, List, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


def clean_html_from_markdown(content: str) -> str:
	"""
	清理Markdown中混入的HTML标签和CSS样式

	保留:
	- 代码块(```...```)中的内容
	- 图片标签 ![...](...) 和 <img>
	- 链接标签 [...](...) 和 <a>

	移除:
	- <span style="...">text</span> → text
	- <br> → 换行
	- 其他无意义的HTML标签
	"""
	# 保护代码块
	code_blocks = []

	def save_code_block(match):
		code_blocks.append(match.group(0))
		return f"__CODE_BLOCK_{len(code_blocks) - 1}__"

	content = re.sub(r"```[\s\S]*?```", save_code_block, content)

	# 移除<span>标签但保留内容
	content = re.sub(r"<span[^>]*>([^<]*)</span>", r"\1", content)

	# 处理嵌套span（多次执行）
	for _ in range(5):
		prev = content
		content = re.sub(r"<span[^>]*>([^<]*)</span>", r"\1", content)
		if content == prev:
			break

	# 移除剩余的空span或复杂span
	content = re.sub(r"<span[^>]*>\s*</span>", "", content)
	content = re.sub(r"<span[^>]*>", "", content)
	content = re.sub(r"</span>", "", content)

	# <br> → 换行
	content = re.sub(r"<br\s*/?>", "\n", content)

	# 移除data-ccp-props等Word导出的属性
	content = re.sub(r'\s*data-ccp-props="[^"]*"', "", content)

	# 清理style属性
	content = re.sub(r'\s*style="[^"]*"', "", content)
	content = re.sub(r'\s*class="[^"]*"', "", content)

	# 清理多余空白
	content = re.sub(r"\n{3,}", "\n\n", content)
	content = re.sub(r" {2,}", " ", content)

	# 恢复代码块
	for i, block in enumerate(code_blocks):
		content = content.replace(f"__CODE_BLOCK_{i}__", block)

	return content.strip()


@dataclass
class Document:
	"""文档对象"""

	id: str
	content: str
	metadata: Dict = field(default_factory=dict)


class DocumentLoader:
	"""
	从目录加载Markdown文档，自动提取目录结构作为metadata

	目录结构示例:
	raw_data/
	├── apis/          # category="api"
	├── docs/          # category="doc"
	└── demos/         # category="demo"

	提取的metadata:
	- category: api/doc/demo
	- path_hierarchy: 完整路径层级列表
	- file_name: 文件名（不含扩展名）
	"""

	CATEGORY_MAP = {
		"apis": "api",
		"docs": "doc",
		"demos": "demo",
	}

	def __init__(self, base_dir: str | Path):
		self.base_dir = Path(base_dir)
		if not self.base_dir.exists():
			raise ValueError(f"目录不存在: {base_dir}")

	def _extract_metadata(self, file_path: Path) -> Dict:
		"""从文件路径提取metadata"""
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
		"""加载单个文件"""
		try:
			content = file_path.read_text(encoding="utf-8")
			if not content.strip():
				return None

			content = clean_html_from_markdown(content)
			metadata = self._extract_metadata(file_path)

			# 生成文档ID
			doc_id = metadata["relative_path"].replace("\\", "/").replace("/", "_")
			for ext in [".md", ".java"]:
				doc_id = doc_id.replace(ext, "")

			return Document(id=doc_id, content=content, metadata=metadata)
		except Exception as e:
			logger.warning(f"加载文件失败 {file_path}: {e}")
			return None

	def load_directory(
		self,
		subdirs: Optional[List[str]] = None,
		extensions: List[str] | None = None,
	) -> Iterator[Document]:
		"""加载目录下的文档"""
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

		logger.info(f"加载完成，共 {total_count} 个文档")

	def load_all(self, subdirs: Optional[List[str]] = None) -> List[Document]:
		"""加载所有文档到列表"""
		return list(self.load_directory(subdirs))
