/**
 * RAG search types for GC-DOC-MCP v2
 */

export interface ChunkMetadata {
	category: string;
	file_name: string;
	path_hierarchy: string[];
	[key: string]: unknown;
}

export interface SearchResult {
	rank: number;
	doc_id: string;
	chunk_id: string;
	score: number;
	content: string;
	content_preview: string;
	metadata: ChunkMetadata;
}

export interface DocChunk {
	chunk_id: string;
	chunk_index: number;
	content: string;
	metadata: ChunkMetadata;
}

export interface SearchResponse {
	query: string;
	results: SearchResult[];
	search_time_ms: number;
	rerank_used: boolean;
	fusion_mode: 'rrf' | 'dense_only';
	detected_lang: string;
	doc_language: string;
}

/**
 * Searcher interface - RAG 搜索抽象层
 */
export interface ISearcher {
	search(query: string, limit?: number, useRerank?: boolean): Promise<SearchResponse>;
	getDocChunks(docId: string): Promise<DocChunk[]>;
}

/**
 * Internal search result (pipeline 内部使用)
 */
export interface InternalSearchResult {
	id: string;
	score: number;
	content: string;
	metadata: Record<string, unknown>;
	source?: 'dense' | 'sparse' | 'rerank';
}
