/**
 * Document types for GC-DOC-MCP v2
 */

export type DocumentCategory = 'api' | 'doc' | 'demo';

export interface DocumentMetadata {
	relative_path: string;
	category?: DocumentCategory;
	[key: string]: unknown;
}

export interface Document {
	id: string;
	content: string;
	metadata: DocumentMetadata;
}

export interface DocChunkMetadata extends DocumentMetadata {
	chunk_index: number;
	total_chunks?: number;
	/** 当前 chunk 所属的 header 层级路径，如 ["基本用法", "绑定到数组"] */
	section_path?: string[];
	/** 文档目录结构（所有 header 提取） */
	doc_toc?: string;
}

export interface Chunk {
	id: string;
	doc_id: string;
	chunk_index: number;
	content: string;
	metadata: DocChunkMetadata;
}

export interface ChunkerOptions {
	chunk_size: number;
	min_chunk_size: number;
}

/** Re-export from config (single source of truth) */
export type { ChunkerType } from '../config/types.js';
