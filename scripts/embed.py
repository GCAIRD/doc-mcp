#!/usr/bin/env python
"""
Index building script

Usage:
	python scripts/embed.py spreadjs
	python scripts/embed.py gcexcel --recreate
	python scripts/embed.py  # Build all projects
"""

import argparse
import logging
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.core.config import ProjectConfig, Settings
from src.core.logger import setup_logging
from src.document import DocumentLoader, get_chunker
from src.embedding import VoyageIndexer

logger = logging.getLogger(__name__)


def build_project(project: str, settings: Settings, project_config: ProjectConfig, args):
	"""Build index for a single project"""
	try:
		proj = project_config.get_project(project)
	except ValueError as e:
		logger.error(str(e))
		return False

	collection_name = proj["collection"]
	raw_data_path = project_config.get_raw_data_path(project)
	chunker_type = project_config.get_chunker_type(project)

	logger.info("=" * 60)
	logger.info(f"Project: {project}")
	logger.info(f"Collection: {collection_name}")
	logger.info(f"Data dir: {raw_data_path}")
	logger.info(f"Mode: {'from scratch' if args.restart else 'resume from checkpoint'}")
	logger.info("=" * 60)

	# Load documents
	logger.info("Loading documents...")
	loader = DocumentLoader(raw_data_path)
	documents = loader.load_all(subdirs=["apis", "docs", "demos"])

	if not documents:
		logger.warning(f"Project {project} has no documents, skipping")
		return False

	logger.info(f"Loaded {len(documents)} documents")

	# Chunk documents
	logger.info("Chunking documents...")
	chunker = get_chunker(
		chunker_type,
		chunk_size=settings.chunk_size,
		chunk_overlap=settings.chunk_overlap,
	)
	chunks = chunker.chunk_documents(documents)
	logger.info(f"Generated {len(chunks)} chunks")

	# Build index
	logger.info("Building index...")
	indexer = VoyageIndexer(settings=settings, collection_name=collection_name)
	stats = indexer.build_index(
		chunks=chunks,
		recreate=args.recreate,
		resume_from_checkpoint=not args.restart,
	)

	logger.info("=" * 60)
	logger.info(f"Project {project} indexing complete")
	logger.info(f"  Total chunks: {stats['total_chunks']}")
	logger.info(f"  Dense: {stats['dense_time']:.1f}s | Sparse: {stats['sparse_time']:.1f}s")
	logger.info("=" * 60)
	return True


def main():
	parser = argparse.ArgumentParser(description="Build RAG index")
	parser.add_argument("project", nargs="?", default=None, help="Project name, omit to build all")
	parser.add_argument("--recreate", action="store_true", help="Recreate collection (clear data)")
	parser.add_argument("--restart", action="store_true", help="Start from scratch, don't resume")
	args = parser.parse_args()

	settings = Settings()
	project_config = ProjectConfig()
	setup_logging(log_level=settings.log_level, log_format="text")

	# Determine projects to build
	if args.project:
		projects = [args.project]
	else:
		projects = project_config.project_names

	for project in projects:
		build_project(project, settings, project_config, args)


if __name__ == "__main__":
	main()
