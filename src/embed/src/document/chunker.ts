/**
 * Chunker factory for GC-DOC-MCP v2
 */

import { ChunkerType, ChunkerOptions } from './types.js';
import { BaseChunker } from './chunkers/base.js';
import { MarkdownChunker } from './chunkers/markdown.js';
import { JavaDocChunker } from './chunkers/javadoc.js';
import { TypeDocChunker } from './chunkers/typedoc.js';

export function createChunker(type: ChunkerType, options: ChunkerOptions): BaseChunker {
	switch (type) {
		case 'markdown':
			return new MarkdownChunker(options);
		case 'javadoc':
			return new JavaDocChunker(options);
		case 'typedoc':
			return new TypeDocChunker(options);
		default: {
			const _exhaustive: never = type;
			throw new Error(`Unknown chunker type: ${_exhaustive}`);
		}
	}
}

export { BaseChunker } from './chunkers/base.js';
export { MarkdownChunker } from './chunkers/markdown.js';
export { JavaDocChunker } from './chunkers/javadoc.js';
export { TypeDocChunker } from './chunkers/typedoc.js';
export * from './types.js';
export * from './loader.js';
