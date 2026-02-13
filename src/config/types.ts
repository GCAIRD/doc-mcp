/**
 * Configuration type definitions for GC-DOC-MCP v2
 */

import { z } from 'zod';

export type ProductType = 'javascript' | 'dotnet' | 'java' | 'platform';
export type ChunkerType = 'markdown' | 'javadoc';
export type Language = 'zh' | 'en' | 'ja';

/**
 * Search configuration
 */
export interface SearchConfig {
	/** Number of results to prefetch before reranking */
	prefetch_limit: number;
	/** Number of top results to keep after reranking */
	rerank_top_k: number;
	/** Default number of results to return */
	default_limit: number;
	/** Dense search score threshold */
	dense_score_threshold: number;
	/** Sparse search score threshold */
	sparse_score_threshold: number;
}

/**
 * Product metadata (language-agnostic)
 */
export interface ProductConfig {
	/** Unique product identifier */
	id: string;
	/** Display name */
	name: string;
	/** Product type */
	type: ProductType;
	/** Chunker strategy */
	chunker: ChunkerType;
	/** Document subdirectories to index */
	doc_subdirs: string[];
	/** Search configuration */
	search: SearchConfig;
	/** Product-specific MCP instructions (from YAML) */
	instructions?: string;
}

/**
 * Resource configuration (CDN scripts, npm packages, etc.)
 */
export interface ResourceConfig {
	/** Display name */
	name: string;
	/** Description */
	description: string;
	/** MIME type */
	mimeType: string;
	/** Content template */
	content: string;
}

/**
 * Language variant configuration
 */
export interface VariantConfig {
	/** Language code */
	lang: Language;
	/** Company name */
	company: string;
	/** Company short name */
	company_short: string;
	/** Document language for search */
	doc_language: string;
	/** Qdrant collection name */
	collection: string;
	/** Raw data path relative to raw_data/ */
	raw_data: string;
	/** npm package scope */
	npm_scope: string;
	/** CDN domain */
	cdn_domain: string;
	/** Server description */
	description: string;
	/** Resource templates */
	resources: Record<string, ResourceConfig>;
}

/**
 * Resolved configuration (product + variant)
 */
export interface ResolvedConfig {
	/** Product metadata */
	product: ProductConfig;
	/** Language variant */
	variant: VariantConfig;
}

/**
 * Raw product YAML schema
 */
export interface ProductYaml {
	id: string;
	name: string;
	type: ProductType;
	chunker: ChunkerType;
	doc_subdirs: string[];
	search?: Partial<SearchConfig>;
	instructions?: string;
}

/**
 * Raw variant YAML schema
 */
export interface VariantYaml {
	lang: Language;
	company: string;
	company_short?: string;
	doc_language: string;
	collection?: string;
	raw_data: string;
	npm_scope: string;
	cdn_domain: string;
	description: string;
	resources?: Record<string, ResourceConfig>;
}

/** ProductYaml 运行时校验 */
export const productYamlSchema = z.object({
	id: z.string(),
	name: z.string(),
	type: z.enum(['javascript', 'dotnet', 'java', 'platform']),
	chunker: z.enum(['markdown', 'javadoc']),
	doc_subdirs: z.array(z.string()),
	search: z.object({
		prefetch_limit: z.number(),
		rerank_top_k: z.number(),
		default_limit: z.number(),
		dense_score_threshold: z.number(),
		sparse_score_threshold: z.number(),
	}).partial().optional(),
	instructions: z.string().optional(),
});

/** VariantYaml 运行时校验 */
export const variantYamlSchema = z.object({
	lang: z.enum(['zh', 'en', 'ja']),
	company: z.string(),
	company_short: z.string().optional(),
	doc_language: z.string(),
	collection: z.string().optional(),
	raw_data: z.string(),
	npm_scope: z.string(),
	cdn_domain: z.string(),
	description: z.string(),
	resources: z.record(z.object({
		name: z.string(),
		description: z.string(),
		mimeType: z.string(),
		content: z.string(),
	})).optional(),
});
