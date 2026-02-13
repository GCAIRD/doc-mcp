/**
 * Document types for GC-DOC-MCP v2
 */

export type DocumentCategory = 'api' | 'doc' | 'demo';

export interface DocumentMetadata {
	file_path: string;
	relative_path: string;
	file_name: string;
	path_hierarchy: string[];
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
	chunk_type?: string;
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
	chunk_overlap: number;
	min_chunk_size: number;
}

/** Re-export from config (single source of truth) */
export type { ChunkerType } from '../config/types.js';
