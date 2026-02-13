/**
 * RAG 搜索器
 *
 * Dense + Sparse 混合搜索 + RRF fusion + Voyage rerank
 * 实现 ISearcher 接口供 MCP tools 使用
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
import { SearchError, ApiError } from '../shared/errors.js';
import { Logger } from '../shared/logger.js';

/** Content preview 最大长度 */
const PREVIEW_LENGTH = 200;
/** RRF (Reciprocal Rank Fusion) 默认 K 参数 */
const DEFAULT_RRF_K = 60;
/** 单文档最大 chunk 数 */
const MAX_DOC_CHUNKS = 100;
/** Voyage API 默认 base URL */
const DEFAULT_VOYAGE_BASE_URL = 'https://api.voyageai.com/v1';

export interface SearcherConfig {
	/** Qdrant 客户端 */
	qdrant: QdrantClient;
	/** Collection 名称 */
	collection: string;
	/** Embedder */
	embedder: VoyageEmbedder;
	/** 文档语言 (zh/en/ja) */
	docLanguage: string;
	/** Voyage Rerank 模型 */
	rerankModel?: string;
	/** Voyage API Key (用于 rerank) */
	voyageApiKey?: string;
	/** 预取数量 */
	prefetchLimit: number;
	/** Rerank 后保留数量 */
	rerankTopK: number;
	/** Dense 搜索 score threshold */
	denseScoreThreshold: number;
	/** Sparse 搜索 score threshold（保留配置项，Qdrant 全文搜索 API 不支持 score threshold 过滤） */
	sparseScoreThreshold: number;
	/** Voyage API base URL */
	voyageBaseUrl?: string;
	/** RRF K 参数 */
	rrfK?: number;
	/** 日志器 */
	logger?: Logger;
}

/**
 * RRF (Reciprocal Rank Fusion) 算法
 */
function rrfFusion(
	results: InternalSearchResult[][],
	k: number = DEFAULT_RRF_K,
): InternalSearchResult[] {
	const scoreMap = new Map<string, { score: number; result: InternalSearchResult }>();

	for (const list of results) {
		list.forEach((result, rank) => {
			const existing = scoreMap.get(result.id);
			const rrfScore = k / (k + rank + 1);

			if (existing) {
				existing.score += rrfScore;
			} else {
				scoreMap.set(result.id, { score: rrfScore, result });
			}
		});
	}

	return Array.from(scoreMap.values())
		.sort((a, b) => b.score - a.score)
		.map(({ score, result }) => ({ ...result, score }));
}

/**
 * Voyage Rerank
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
			this.logger.warn('Rerank failed, returning original results:', error);
			return documents;
		}
	}
}

/**
 * 从 chunk ID 提取 doc_id
 * "apis_Workbook_chunk0" → "apis_Workbook"
 */
function extractDocId(chunkId: string): string {
	return chunkId.replace(/_chunk\d+$/, '');
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
	/** 保留配置项，Qdrant 全文搜索 API 不支持 score threshold 过滤 */
	private readonly sparseScoreThreshold: number;
	private readonly rrfK: number;

	constructor(config: SearcherConfig) {
		this.qdrant = config.qdrant;
		this.embedder = config.embedder;
		this.collection = config.collection;
		this.docLanguage = config.docLanguage;
		this.prefetchLimit = config.prefetchLimit;
		this.rerankTopK = config.rerankTopK;
		this.denseScoreThreshold = config.denseScoreThreshold;
		this.sparseScoreThreshold = config.sparseScoreThreshold;
		this.rrfK = config.rrfK ?? DEFAULT_RRF_K;
		this.logger = config.logger ?? new Logger();

		if (config.voyageApiKey && config.rerankModel) {
			const baseUrl = config.voyageBaseUrl ?? DEFAULT_VOYAGE_BASE_URL;
			this.reranker = new VoyageReranker(config.voyageApiKey, config.rerankModel, baseUrl, this.logger);
		}
	}

	/**
	 * ISearcher.search - 混合搜索 + rerank
	 */
	async search(query: string, limit?: number, useRerank?: boolean): Promise<SearchResponse> {
		const startTime = Date.now();
		const finalLimit = limit ?? this.rerankTopK;
		const detectedLang = detectLanguage(query);

		this.logger.info(`Searching: "${query.substring(0, 50)}..."`);

		// 并行 dense + sparse
		const [denseResults, sparseResults] = await Promise.all([
			this.searchDense(query, this.prefetchLimit),
			this.searchSparse(query, this.prefetchLimit),
		]);

		this.logger.debug(`Dense: ${denseResults.length}, Sparse: ${sparseResults.length}`);

		// RRF fusion
		const fused = rrfFusion([denseResults, sparseResults], this.rrfK);
		const topK = fused.slice(0, this.prefetchLimit);

		// Rerank
		let finalResults: InternalSearchResult[];
		const rerankUsed = useRerank !== false && !!this.reranker;
		const fusionMode = sparseResults.length > 0 ? 'rrf' : 'dense_only';

		if (rerankUsed && this.reranker) {
			const reranked = await this.reranker.rerank(query, topK, this.rerankTopK);
			finalResults = reranked.slice(0, finalLimit);
		} else {
			finalResults = topK.slice(0, finalLimit);
		}

		// 转换为 SearchResult 格式
		const results: SearchResult[] = finalResults.map((r, i) => ({
			rank: i + 1,
			doc_id: extractDocId(r.id),
			chunk_id: r.id,
			score: r.score,
			content: r.content,
			content_preview: r.content.substring(0, PREVIEW_LENGTH),
			metadata: r.metadata as ChunkMetadata,
		}));

		this.logger.info(`Returning ${results.length} results`);

		return {
			query,
			results,
			search_time_ms: Date.now() - startTime,
			rerank_used: rerankUsed,
			fusion_mode: fusionMode,
			detected_lang: detectedLang,
			doc_language: this.docLanguage,
		};
	}

	/**
	 * ISearcher.getDocChunks - 获取文档所有 chunks
	 */
	async getDocChunks(docId: string): Promise<DocChunk[]> {
		const scrollResult = await this.qdrant.scroll(
			this.collection,
			{ must: [{ key: 'doc_id', match: { value: docId } }] },
			MAX_DOC_CHUNKS,
		);

		if (scrollResult.status !== 'ok' || !scrollResult.result?.points) {
			return [];
		}

		return scrollResult.result.points
			.map(p => ({
				chunk_id: String(p.id),
				chunk_index: (p.payload?.chunk_index as number) ?? 0,
				content: (p.payload?.content as string) ?? '',
				metadata: (p.payload?.metadata as ChunkMetadata) ?? { category: '', file_name: '', path_hierarchy: [] },
			}))
			.sort((a, b) => a.chunk_index - b.chunk_index);
	}

	/** Qdrant 搜索结果 -> InternalSearchResult 映射 */
	private mapResults(
		results: QdrantSearchResult[],
		source: 'dense' | 'sparse',
	): InternalSearchResult[] {
		return results.map(r => ({
			id: String(r.id),
			score: r.score,
			content: (r.payload?.content as string) ?? '',
			metadata: (r.payload?.metadata as Record<string, unknown>) ?? {},
			source,
		}));
	}

	private async searchDense(query: string, limit: number): Promise<InternalSearchResult[]> {
		try {
			const vector = await this.embedder.embed(query);
			const response = await this.qdrant.search(
				this.collection, vector, limit, this.denseScoreThreshold,
			);

			if (response.status !== 'ok' || !response.result) {
				throw new SearchError(`Dense search failed: ${response.error ?? 'unknown'}`);
			}

			return this.mapResults(response.result, 'dense');
		} catch (error) {
			if (error instanceof SearchError) throw error;
			throw new SearchError(
				`Dense search error: ${error instanceof Error ? error.message : String(error)}`,
				error as Error,
			);
		}
	}

	private async searchSparse(query: string, limit: number): Promise<InternalSearchResult[]> {
		try {
			const response = await this.qdrant.searchFullText(
				this.collection, query, limit,
			);

			if (response.status !== 'ok' || !response.result) {
				throw new SearchError(`Sparse search failed: ${response.error ?? 'unknown'}`);
			}

			return this.mapResults(response.result, 'sparse');
		} catch (error) {
			this.logger.warn('Sparse search failed, returning empty:', error);
			return [];
		}
	}
}

/**
 * 工厂函数
 */
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
	sparseScoreThreshold: number;
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
		sparseScoreThreshold: options.sparseScoreThreshold,
		rrfK: options.rrfK ?? DEFAULT_RRF_K,
		logger: options.logger,
	});
}
