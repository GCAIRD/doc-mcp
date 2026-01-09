#!/usr/bin/env python
"""
索引构建脚本

用法:
	python scripts/embed.py spreadjs
	python scripts/embed.py gcexcel --recreate
	python scripts/embed.py  # 构建所有项目
"""

import argparse
import logging
import sys
from pathlib import Path

# 添加src到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.core.config import ProjectConfig, Settings
from src.core.logger import setup_logging
from src.document import DocumentLoader, get_chunker
from src.embedding import VoyageIndexer

logger = logging.getLogger(__name__)


def build_project(project: str, settings: Settings, project_config: ProjectConfig, args):
	"""构建单个项目的索引"""
	try:
		proj = project_config.get_project(project)
	except ValueError as e:
		logger.error(str(e))
		return False

	collection_name = proj["collection"]
	raw_data_path = project_config.get_raw_data_path(project)
	chunker_type = project_config.get_chunker_type(project)

	logger.info("=" * 60)
	logger.info(f"项目: {project}")
	logger.info(f"Collection: {collection_name}")
	logger.info(f"数据目录: {raw_data_path}")
	logger.info(f"模式: {'从头开始' if args.restart else '断点续传'}")
	logger.info("=" * 60)

	# 加载文档
	logger.info("加载文档...")
	loader = DocumentLoader(raw_data_path)
	documents = loader.load_all(subdirs=["apis", "docs", "demos"])

	if not documents:
		logger.warning(f"项目 {project} 没有找到文档，跳过")
		return False

	logger.info(f"加载了 {len(documents)} 个文档")

	# 分块
	logger.info("分块文档...")
	chunker = get_chunker(
		chunker_type,
		chunk_size=settings.chunk_size,
		chunk_overlap=settings.chunk_overlap,
	)
	chunks = chunker.chunk_documents(documents)
	logger.info(f"生成了 {len(chunks)} 个块")

	# 构建索引
	logger.info("构建索引...")
	indexer = VoyageIndexer(settings=settings, collection_name=collection_name)
	stats = indexer.build_index(
		chunks=chunks,
		recreate=args.recreate,
		resume_from_checkpoint=not args.restart,
	)

	logger.info("=" * 60)
	logger.info(f"项目 {project} 索引构建完成")
	logger.info(f"  总块数: {stats['total_chunks']}")
	logger.info(f"  Dense: {stats['dense_time']:.1f}s | Sparse: {stats['sparse_time']:.1f}s")
	logger.info("=" * 60)
	return True


def main():
	parser = argparse.ArgumentParser(description="构建 RAG 索引")
	parser.add_argument("project", nargs="?", default=None, help="项目名称，不指定则构建所有")
	parser.add_argument("--recreate", action="store_true", help="重建 collection（清空数据）")
	parser.add_argument("--restart", action="store_true", help="从头开始，不从断点恢复")
	args = parser.parse_args()

	settings = Settings()
	project_config = ProjectConfig()
	setup_logging(log_level=settings.log_level, log_format="text")

	# 确定要构建的项目
	if args.project:
		projects = [args.project]
	else:
		projects = project_config.project_names

	for project in projects:
		build_project(project, settings, project_config, args)


if __name__ == "__main__":
	main()
