/**
 * Unified Qdrant REST Client
 *
 * 统一的 Qdrant HTTP 客户端，searcher 和 indexer 共用
 */

import { ApiError } from '../shared/errors.js';

export interface QdrantSearchResult {
	id: string | number;
	score: number;
	payload?: Record<string, unknown>;
}

export interface QdrantSearchResponse {
	status: 'ok' | 'error';
	result?: QdrantSearchResult[];
	error?: string;
}

export interface QdrantScrollResponse {
	status: 'ok' | 'error';
	result?: {
		points: Array<{
			id: string | number;
			payload?: Record<string, unknown>;
		}>;
		next_page_offset?: string | number | null;
	};
	error?: string;
}

export interface UpsertPoint {
	id: string;
	vector: number[];
	payload: Record<string, unknown>;
}

/**
 * Qdrant REST Client
 */
export class QdrantClient {
	private readonly baseUrl: string;
	private readonly headers: Record<string, string>;

	constructor(url: string, apiKey?: string) {
		this.baseUrl = url.replace(/\/$/, '');
		this.headers = { 'Content-Type': 'application/json' };
		if (apiKey) {
			this.headers['api-key'] = apiKey;
		}
	}

	/**
	 * 通用请求方法
	 */
	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const response = await fetch(`${this.baseUrl}${path}`, {
			method,
			headers: this.headers,
			body: body ? JSON.stringify(body) : undefined,
		});

		if (!response.ok) {
			const text = await response.text();
			throw new ApiError(`Qdrant ${method} ${path} failed: ${response.status} ${text}`, response.status);
		}

		return response.json() as Promise<T>;
	}

	/**
	 * 向量搜索 (Dense)
	 */
	async search(
		collection: string,
		vector: number[],
		limit: number,
		scoreThreshold?: number,
	): Promise<QdrantSearchResponse> {
		const body: Record<string, unknown> = { limit, vector, with_payload: true };
		if (scoreThreshold !== undefined) {
			body.score_threshold = scoreThreshold;
		}
		return this.request<QdrantSearchResponse>(
			'POST',
			`/collections/${collection}/points/search`,
			body,
		);
	}

	/**
	 * 全文搜索 (基于 payload text index)
	 *
	 * Qdrant 的全文搜索通过 scroll + text match filter 实现，
	 * 不返回相关性分数，调用方需自行处理排序。
	 */
	async searchFullText(
		collection: string,
		query: string,
		limit: number,
	): Promise<QdrantSearchResponse> {
		const scrollResp = await this.request<QdrantScrollResponse>(
			'POST',
			`/collections/${collection}/points/scroll`,
			{
				filter: {
					must: [{ key: 'content', match: { text: query } }],
				},
				limit,
				with_payload: true,
			},
		);

		if (scrollResp.status !== 'ok' || !scrollResp.result?.points) {
			return { status: scrollResp.status, error: scrollResp.error, result: [] };
		}

		// scroll 不提供相关性分数，按位置赋递减分数（RRF 只关心排名）
		const result = scrollResp.result.points.map((p, i) => ({
			id: p.id,
			score: 1.0 / (i + 1),
			payload: p.payload,
		}));

		return { status: 'ok', result };
	}

	/**
	 * Scroll with filter (用于按条件批量获取)
	 */
	async scroll(
		collection: string,
		filter: Record<string, unknown>,
		limit: number,
	): Promise<QdrantScrollResponse> {
		return this.request<QdrantScrollResponse>(
			'POST',
			`/collections/${collection}/points/scroll`,
			{ filter, limit, with_payload: true },
		);
	}

	/**
	 * 批量 upsert
	 */
	async upsert(collection: string, points: UpsertPoint[]): Promise<void> {
		if (points.length === 0) return;
		await this.request<unknown>(
			'PUT',
			`/collections/${collection}/points`,
			{ points },
		);
	}

	/**
	 * 删除 points
	 */
	async deletePoints(collection: string, pointIds: string[]): Promise<void> {
		if (pointIds.length === 0) return;
		await this.request<unknown>(
			'POST',
			`/collections/${collection}/points/delete`,
			{ points: pointIds },
		);
	}

	/**
	 * 检查 collection 是否存在
	 */
	async collectionExists(collection: string): Promise<boolean> {
		try {
			await this.request<unknown>('GET', `/collections/${collection}`);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * 创建 collection
	 */
	async createCollection(
		collection: string,
		vectorSize: number,
		tokenizer: 'whitespace' | 'word' | 'multilingual' = 'multilingual',
	): Promise<void> {
		await this.request<unknown>('PUT', `/collections/${collection}`, {
			vectors: { size: vectorSize, distance: 'Cosine' },
			payload_index: [
				{
					field_name: 'content',
					field_schema: {
						type: 'text',
						tokenizer,
						min_token_len: 2,
						max_token_len: 30,
					},
				},
			],
		});
	}

	/**
	 * 删除 collection
	 */
	async deleteCollection(collection: string): Promise<void> {
		await this.request<unknown>('DELETE', `/collections/${collection}`);
	}

	/**
	 * 获取 collection 信息
	 */
	async getCollectionInfo(collection: string): Promise<{ result?: { points_count?: number } }> {
		return this.request<{ result?: { points_count?: number } }>('GET', `/collections/${collection}`);
	}
}
