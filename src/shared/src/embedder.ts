/**
 * Voyage AI Embedding Wrapper
 *
 * 封装 voyageai SDK，支持：
 * - 批量 embedding
 * - 速率限制
 * - 自动重试
 */

import { VoyageAIClient } from 'voyageai';
import { RateLimiter } from './rate-limiter.js';
import { ApiError, RateLimitError } from './errors.js';
import { Logger } from './logger.js';

export interface EmbedderConfig {
	apiKey: string;
	model: string;
	/** Embedding 向量维度 */
	embeddingDim: number;
	/** 批量大小 */
	batchSize: number;
	/** 最大重试次数 */
	maxRetries?: number;
	/** 初始重试延迟（毫秒） */
	retryDelay?: number;
	/** 速率限制器 */
	rateLimiter?: RateLimiter;
	logger?: Logger;
}

export interface EmbedResult {
	/** 文本内容 */
	text: string;
	/** Embedding 向量 */
	embedding: number[];
	/** 使用的 token 数（估算） */
	tokens: number;
}

/** Voyage API 单次 batch 的 token 上限（实际限制 120k，留 50% 余量应对估算偏差） */
const MAX_BATCH_TOKENS = 60_000;

/**
 * 估算文本 token 数
 * 保守估算：英文/代码 2.5 字符/token（代码 token 密度高），中文 1.5 字符/token
 */
function estimateTokens(text: string): number {
	const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
	const otherChars = text.length - chineseChars;
	return Math.ceil(chineseChars / 1.5 + otherChars / 2.5);
}

/**
 * Voyage Embedder
 */
export class VoyageEmbedder {
	private readonly client: VoyageAIClient;
	private readonly config: Required<Omit<EmbedderConfig, 'apiKey' | 'rateLimiter' | 'logger'>>;
	private readonly rateLimiter: RateLimiter | undefined;
	private readonly logger: Logger;

	constructor(config: EmbedderConfig) {
		this.client = new VoyageAIClient({ apiKey: config.apiKey });
		this.config = {
			model: config.model,
			embeddingDim: config.embeddingDim,
			batchSize: config.batchSize,
			maxRetries: config.maxRetries ?? 3,
			retryDelay: config.retryDelay ?? 1000,
		};
		this.rateLimiter = config.rateLimiter;
		this.logger = config.logger ?? new Logger();
	}

	/**
	 * 嵌入单段文本
	 */
	async embed(text: string): Promise<number[]> {
		const results = await this.embedBatch([text]);
		return results[0].embedding;
	}

	/**
	 * 批量嵌入（按 token 数动态分批，避免超出 Voyage API 的 batch token 限制）
	 */
	async embedBatch(texts: string[]): Promise<EmbedResult[]> {
		if (texts.length === 0) {
			return [];
		}

		const allResults: EmbedResult[] = [];

		let batch: string[] = [];
		let batchTokens = 0;

		for (const text of texts) {
			const tokens = estimateTokens(text);

			if (batch.length > 0 && (batchTokens + tokens > MAX_BATCH_TOKENS || batch.length >= this.config.batchSize)) {
				const results = await this.embedBatchWithRetry(batch);
				allResults.push(...results);
				batch = [];
				batchTokens = 0;
			}

			batch.push(text);
			batchTokens += tokens;
		}

		if (batch.length > 0) {
			const results = await this.embedBatchWithRetry(batch);
			allResults.push(...results);
		}

		return allResults;
	}

	/**
	 * 带重试的批量嵌入
	 */
	private async embedBatchWithRetry(texts: string[], attempt = 1): Promise<EmbedResult[]> {
		try {
			// 估算 token 数
			const totalTokens = texts.reduce((sum, text) => sum + estimateTokens(text), 0);

			// 检查速率限制
			this.rateLimiter?.checkAndRecord(totalTokens);

			this.logger.debug(`Embedding ${texts.length} texts, ~${totalTokens} tokens`);

			const response = await this.client.embed({
				input: texts,
				model: this.config.model,
			});

			const embeddings = response.data ?? [];
			const results: EmbedResult[] = texts.map((text, idx) => ({
				text,
				embedding: embeddings[idx]?.embedding ?? [],
				tokens: estimateTokens(text),
			}));

			// 验证向量维度
			for (const result of results) {
				if (result.embedding.length !== this.config.embeddingDim) {
					throw new Error(
						`Embedding dimension mismatch: expected ${this.config.embeddingDim}, got ${result.embedding.length}`,
					);
				}
			}

			return results;
		} catch (error) {
			const isRetryable = this.isRetryableError(error);
			const shouldRetry = attempt < this.config.maxRetries && isRetryable;

			if (shouldRetry) {
				const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
				this.logger.warn(`Embed failed (attempt ${attempt}), retrying in ${delay}ms`, { error: error instanceof Error ? error.message : String(error) });
				await this.sleep(delay);
				return this.embedBatchWithRetry(texts, attempt + 1);
			}

			if (error instanceof RateLimitError) {
				throw error;
			}

			throw new ApiError(
				`Failed to embed texts after ${attempt} attempts: ${error instanceof Error ? error.message : String(error)}`,
				undefined,
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * 判断错误是否可重试
	 */
	private isRetryableError(error: unknown): boolean {
		if (error instanceof RateLimitError) {
			return true;
		}
		if (error instanceof Error) {
			const message = error.message.toLowerCase();
			return (
				message.includes('timeout') ||
				message.includes('econnreset') ||
				message.includes('econnrefused') ||
				message.includes('529') ||
				message.includes('500') ||
				message.includes('502') ||
				message.includes('503')
			);
		}
		return false;
	}

	/**
	 * 延迟函数
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * 获取嵌入维度
	 */
	getEmbeddingDim(): number {
		return this.config.embeddingDim;
	}

	/**
	 * 获取批量大小
	 */
	getBatchSize(): number {
		return this.config.batchSize;
	}
}

/**
 * 创建 Voyage embedder 实例的工厂函数
 */
export interface CreateVoyageEmbedderOptions {
	apiKey?: string;
	model?: string;
	embeddingDim?: number;
	batchSize?: number;
	rateLimiter?: RateLimiter;
	logger?: Logger;
}

export function createVoyageEmbedder(options: CreateVoyageEmbedderOptions = {}): VoyageEmbedder {
	const apiKey = options.apiKey ?? process.env.VOYAGE_API_KEY;
	if (!apiKey) {
		throw new ApiError('VOYAGE_API_KEY is required');
	}

	// Voyage 模型配置
	const modelDefaults: Record<string, { dim: number }> = {
		'voyage-3': { dim: 1024 },
		'voyage-3-lite': { dim: 512 },
		'voyage-finance-2': { dim: 1024 },
		'voyage-multilingual-2': { dim: 1024 },
		'voyage-law-2': { dim: 1024 },
		'voyage-code-2': { dim: 1536 },
		'voyage-code-3': { dim: 1024 },
		'voyage-large-2': { dim: 1536 },
		'voyage-2': { dim: 1024 },
	};

	const model = options.model ?? 'voyage-3';
	const defaults = modelDefaults[model];

	if (!defaults) {
		throw new ApiError(`Unknown Voyage model: ${model}`);
	}

	return new VoyageEmbedder({
		apiKey,
		model,
		embeddingDim: options.embeddingDim ?? defaults.dim,
		batchSize: options.batchSize ?? 128,
		rateLimiter: options.rateLimiter,
		logger: options.logger,
	});
}
