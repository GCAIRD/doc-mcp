/**
 * RAG 搜索器
 *
 * 跨语言混合搜索:
 * - 同语言查询: Dense + BM25 → Qdrant server-side RRF fusion
 * - 跨语言查询: Dense only (BM25 对异语言无效)
 * - Voyage rerank 精排
 */

import { QdrantClient, type QdrantSearchResult } from './qdrant-client.js';
import { VoyageEmbedder } from './embedder.js';
import { detectLanguage } from './language-detect.js';
import type {
	ISearcher,
	SearchResponse,
	SearchResult,
	DocChunk,
	ChunkMetadata,
	InternalSearchResult,
} from './types.js';
import { ApiError } from '../shared/errors.js';
import { Logger } from '../shared/logger.js';

const PREVIEW_LENGTH = 200;
const MAX_DOC_CHUNKS = 100;
const DEFAULT_VOYAGE_BASE_URL = 'https://api.voyageai.com/v1';

export interface SearcherConfig {
	qdrant: QdrantClient;
	collection: string;
	embedder: VoyageEmbedder;
	/** 文档主语言 (zh/en/ja) */
	docLanguage: string;
	/** Voyage Rerank 模型 */
	rerankModel?: string;
	/** Voyage API Key */
	voyageApiKey?: string;
	/** 预取数量 */
	prefetchLimit: number;
	/** Rerank 后保留数量 */
	rerankTopK: number;
	/** Dense 搜索 score threshold */
	denseScoreThreshold: number;
	/** RRF k 参数 (Qdrant 1.16+) */
	rrfK?: number;
	/** Voyage API base URL */
	voyageBaseUrl?: string;
	logger?: Logger;
}

/**
 * Voyage Reranker
 */
class VoyageReranker {
	constructor(
		private readonly apiKey: string,
		private readonly model: string,
		private readonly baseUrl: string,
		private readonly logger: Logger,
	) {}

	async rerank(query: string, documents: InternalSearchResult[], topK: number): Promise<InternalSearchResult[]> {
		if (documents.length === 0) return [];

		this.logger.debug(`Reranking ${documents.length} documents`);

		try {
			const response = await fetch(`${this.baseUrl}/rerank`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					query,
					documents: documents.map(d => d.content),
					model: this.model,
					top_k: Math.min(topK, documents.length),
				}),
			});

			if (!response.ok) {
				const text = await response.text();
				throw new ApiError(`Voyage rerank failed: ${response.status} ${text}`, response.status);
			}

			const data = await response.json() as {
				data?: Array<{ index: number; relevance_score: number }>;
			};

			if (!data.data) {
				throw new ApiError('Invalid rerank response: missing data');
			}

			return data.data
				.map(r => ({
					...documents[r.index],
					score: r.relevance_score,
					source: 'rerank' as const,
				}))
				.sort((a, b) => b.score - a.score);
		} catch (error) {
			this.logger.warn('Rerank failed, returning original results', { error: error instanceof Error ? error.message : String(error) });
			return documents;
		}
	}
}

/** Qdrant 结果 → InternalSearchResult（从 payload 读 chunk_id/doc_id） */
function mapQdrantResults(results: QdrantSearchResult[]): InternalSearchResult[] {
	return results.map(r => ({
		id: (r.payload?.chunk_id as string) ?? String(r.id),
		score: r.score,
		content: (r.payload?.content as string) ?? '',
		metadata: {
			...((r.payload?.metadata as Record<string, unknown>) ?? {}),
			doc_id: r.payload?.doc_id,
		},
	}));
}

/**
 * RAG 搜索器 - 实现 ISearcher
 */
export class RagSearcher implements ISearcher {
	private readonly qdrant: QdrantClient;
	private readonly embedder: VoyageEmbedder;
	private readonly reranker: VoyageReranker | undefined;
	private readonly logger: Logger;
	private readonly collection: string;
	private readonly docLanguage: string;
	private readonly prefetchLimit: number;
	private readonly rerankTopK: number;
	private readonly denseScoreThreshold: number;
	private readonly rrfK: number;

	constructor(config: SearcherConfig) {
		this.qdrant = config.qdrant;
		this.embedder = config.embedder;
		this.collection = config.collection;
		this.docLanguage = config.docLanguage;
		this.prefetchLimit = config.prefetchLimit;
		this.rerankTopK = config.rerankTopK;
		this.denseScoreThreshold = config.denseScoreThreshold;
		this.rrfK = config.rrfK ?? 60;
		this.logger = config.logger ?? new Logger();

		if (config.voyageApiKey && config.rerankModel) {
			const baseUrl = config.voyageBaseUrl ?? DEFAULT_VOYAGE_BASE_URL;
			this.reranker = new VoyageReranker(config.voyageApiKey, config.rerankModel, baseUrl, this.logger);
		}
	}

	/**
	 * 混合搜索 + rerank
	 *
	 * 跨语言策略:
	 * - query 语言 == doc 语言 → Dense + BM25 RRF fusion
	 * - query 语言 != doc 语言 → Dense only (跨语言场景 BM25 无效)
	 */
	async search(query: string, limit?: number, useRerank?: boolean): Promise<SearchResponse> {
		const startTime = Date.now();
		const finalLimit = limit ?? this.rerankTopK;
		const detectedLang = detectLanguage(query);
		const useBm25 = detectedLang === this.docLanguage;

		this.logger.info(
			`Search: "${query.substring(0, 50)}..." ` +
			`lang=${detectedLang} doc=${this.docLanguage} bm25=${useBm25}`,
		);

		// Dense embedding
		const denseVector = await this.embedder.embed(query);

		// 根据语言选择搜索策略
		const prefetchLimit = (useRerank !== false && this.reranker) ? this.prefetchLimit : finalLimit;
		let candidates: QdrantSearchResult[];
		let fusionMode: 'rrf' | 'dense_only';

		if (useBm25) {
			candidates = await this.qdrant.queryHybrid(
				this.collection, denseVector, query, prefetchLimit, this.rrfK,
			);
			fusionMode = 'rrf';
		} else {
			candidates = await this.qdrant.queryDense(
				this.collection, denseVector, prefetchLimit, this.denseScoreThreshold,
			);
			fusionMode = 'dense_only';
		}

		this.logger.debug(`Retrieved ${candidates.length} candidates (${fusionMode})`);

		// Map to internal format
		let results = mapQdrantResults(candidates);

		// Rerank
		const rerankUsed = useRerank !== false && !!this.reranker;
		if (rerankUsed && this.reranker) {
			results = await this.reranker.rerank(query, results, this.rerankTopK);
		}
		results = results.slice(0, finalLimit);

		// 转换为 SearchResult
		const searchResults: SearchResult[] = results.map((r, i) => ({
			rank: i + 1,
			doc_id: (r.metadata?.doc_id as string) ?? r.id.replace(/_chunk\d+$/, ''),
			chunk_id: r.id,
			score: r.score,
			content: r.content,
			content_preview: r.content.substring(0, PREVIEW_LENGTH),
			metadata: r.metadata as ChunkMetadata,
		}));

		this.logger.info(`Returning ${searchResults.length} results (${fusionMode})`);

		return {
			query,
			results: searchResults,
			search_time_ms: Date.now() - startTime,
			rerank_used: rerankUsed,
			fusion_mode: fusionMode,
			detected_lang: detectedLang,
			doc_language: this.docLanguage,
		};
	}

	async getDocChunks(docId: string): Promise<DocChunk[]> {
		const scrollResult = await this.qdrant.scroll(
			this.collection,
			{ must: [{ key: 'doc_id', match: { value: docId } }] },
			MAX_DOC_CHUNKS,
		);

		if (scrollResult.points.length === 0) {
			return [];
		}

		return scrollResult.points
			.map((p: { id: string | number; payload?: Record<string, unknown> | null }) => ({
				chunk_id: String(p.id),
				chunk_index: (p.payload?.chunk_index as number) ?? 0,
				content: (p.payload?.content as string) ?? '',
				metadata: (p.payload?.metadata as ChunkMetadata) ?? { relative_path: '', category: '' },
			}))
			.sort((a, b) => a.chunk_index - b.chunk_index);
	}
}

/** 工厂函数 */
export interface CreateSearcherOptions {
	qdrantUrl: string;
	qdrantApiKey?: string;
	collection: string;
	docLanguage: string;
	embedder: VoyageEmbedder;
	rerankModel?: string;
	voyageApiKey?: string;
	voyageBaseUrl?: string;
	prefetchLimit: number;
	rerankTopK: number;
	denseScoreThreshold: number;
	rrfK?: number;
	logger?: Logger;
}

export function createSearcher(options: CreateSearcherOptions): RagSearcher {
	const qdrant = new QdrantClient(options.qdrantUrl, options.qdrantApiKey);

	return new RagSearcher({
		qdrant,
		collection: options.collection,
		docLanguage: options.docLanguage,
		embedder: options.embedder,
		rerankModel: options.rerankModel,
		voyageApiKey: options.voyageApiKey,
		voyageBaseUrl: options.voyageBaseUrl,
		prefetchLimit: options.prefetchLimit,
		rerankTopK: options.rerankTopK,
		denseScoreThreshold: options.denseScoreThreshold,
		rrfK: options.rrfK,
		logger: options.logger,
	});
}
