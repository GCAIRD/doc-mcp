/**
 * Qdrant Client Wrapper
 *
 * 基于 @qdrant/js-client-rest 官方 SDK
 * 封装 dense + native BM25 混合搜索的业务方法
 */

import { QdrantClient as QdrantSdk } from '@qdrant/js-client-rest';
import { createHash } from 'node:crypto';

/** Qdrant 内置 BM25 推理模型 */
export const BM25_MODEL = 'Qdrant/bm25';

/** 字符串 ID → 确定性 UUID（MD5 哈希） */
export function stringToUuid(str: string): string {
	const hex = createHash('md5').update(str).digest('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Upsert point: named dense + BM25 text inference */
export interface UpsertPoint {
	id: string;
	vector: {
		dense: number[];
		bm25: { text: string; model: string };
	};
	payload: Record<string, unknown>;
}

/** 搜索结果 (query API) */
export interface QdrantSearchResult {
	id: string | number;
	score: number;
	payload?: Record<string, unknown> | null;
}

/** Scroll 结果 */
export interface QdrantScrollResult {
	points: Array<{
		id: string | number;
		payload?: Record<string, unknown> | null;
	}>;
	nextPageOffset?: string | number | null;
}

/**
 * Qdrant Client
 */
export class QdrantClient {
	private readonly sdk: QdrantSdk;

	constructor(url: string, apiKey?: string) {
		this.sdk = new QdrantSdk({ url, apiKey });
	}

	// ── Collection 管理 ────────────────────────────────────

	/**
	 * 创建 collection (named dense + BM25 sparse with IDF)
	 */
	async createCollection(collection: string, denseVectorSize: number): Promise<void> {
		await this.sdk.createCollection(collection, {
			vectors: {
				dense: {
					size: denseVectorSize,
					distance: 'Cosine',
					hnsw_config: { m: 16, ef_construct: 100 },
				},
			},
			sparse_vectors: {
				bm25: { modifier: 'idf' },
			},
			optimizers_config: {
				indexing_threshold: 10000,
			},
		});
	}

	async collectionExists(collection: string): Promise<boolean> {
		const { exists } = await this.sdk.collectionExists(collection);
		return exists;
	}

	async deleteCollection(collection: string): Promise<void> {
		await this.sdk.deleteCollection(collection);
	}

	async getCollectionInfo(collection: string): Promise<{ pointsCount?: number | null }> {
		const info = await this.sdk.getCollection(collection);
		return { pointsCount: info.points_count };
	}

	// ── 数据操作 ────────────────────────────────────────────

	async upsert(collection: string, points: UpsertPoint[]): Promise<void> {
		if (points.length === 0) return;
		await this.withRetry(() => this.sdk.upsert(collection, {
			wait: true,
			points: points.map(p => ({
				id: stringToUuid(p.id),
				vector: p.vector as unknown as Record<string, number[]>,
				payload: { ...p.payload, chunk_id: p.id },
			})),
		}));
	}

	async deletePoints(collection: string, pointIds: string[]): Promise<void> {
		if (pointIds.length === 0) return;
		await this.sdk.delete(collection, { points: pointIds.map(stringToUuid) });
	}

	// ── 搜索 ────────────────────────────────────────────────

	/**
	 * 混合搜索: dense + BM25 → server-side RRF fusion
	 */
	async queryHybrid(
		collection: string,
		denseVector: number[],
		queryText: string,
		limit: number,
		rrfK = 60,
	): Promise<QdrantSearchResult[]> {
		const resp = await this.sdk.query(collection, {
			prefetch: [
				{ query: denseVector, using: 'dense', limit },
				{ query: { text: queryText, model: BM25_MODEL } as unknown as number[], using: 'bm25', limit },
			],
			query: { rrf: { k: rrfK } } as unknown as number[],
			limit,
			with_payload: true,
		});
		return this.mapScoredPoints(resp.points);
	}

	/**
	 * Dense-only 搜索 (跨语言)
	 */
	async queryDense(
		collection: string,
		vector: number[],
		limit: number,
		scoreThreshold?: number,
	): Promise<QdrantSearchResult[]> {
		const resp = await this.sdk.query(collection, {
			query: vector,
			using: 'dense',
			limit,
			score_threshold: scoreThreshold ?? null,
			with_payload: true,
		});
		return this.mapScoredPoints(resp.points);
	}

	/**
	 * Scroll with filter
	 */
	async scroll(
		collection: string,
		filter: Record<string, unknown>,
		limit: number,
	): Promise<QdrantScrollResult> {
		const resp = await this.sdk.scroll(collection, {
			filter: filter as Parameters<QdrantSdk['scroll']>[1] extends infer T
				? T extends { filter?: infer F } ? F : never : never,
			limit,
			with_payload: true,
		});
		return {
			points: resp.points.map(p => ({
				id: p.id,
				payload: p.payload as Record<string, unknown> | null,
			})),
			nextPageOffset: resp.next_page_offset as string | number | null | undefined,
		};
	}

	// ── 内部 ────────────────────────────────────────────────

	private mapScoredPoints(points: Array<{ id: string | number; score: number; payload?: Record<string, unknown> | null }>): QdrantSearchResult[] {
		return points.map(p => ({
			id: p.id,
			score: p.score,
			payload: p.payload,
		}));
	}

	private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
		for (let attempt = 1; ; attempt++) {
			try {
				return await fn();
			} catch (err) {
				if (attempt >= maxRetries) throw err;
				const delay = 1000 * attempt;
				await new Promise(r => setTimeout(r, delay));
			}
		}
	}
}
