/**
 * RAG 索引构建器
 *
 * 批量 embedding + Qdrant upsert + Checkpoint 断点续传
 */

import { QdrantClient } from './qdrant-client.js';
import { VoyageEmbedder } from './embedder.js';
import { Chunk } from '../document/types.js';
import { Logger } from '../shared/logger.js';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface IndexerConfig {
	/** Qdrant 客户端 */
	qdrant: QdrantClient;
	/** Collection 名称 */
	collection: string;
	/** Embedder */
	embedder: VoyageEmbedder;
	/** 批量 upsert 大小 */
	batchSize: number;
	/** Checkpoint 文件路径 */
	checkpointPath?: string;
	/** 日志器 */
	logger?: Logger;
}

export interface IndexStats {
	totalChunks: number;
	successCount: number;
	failedCount: number;
	skippedCount: number;
	durationMs: number;
}

export interface CheckpointData {
	lastProcessedId: string | null;
	timestamp: number;
}

/**
 * RAG 索引构建器
 */
export class RagIndexer {
	private readonly qdrant: QdrantClient;
	private readonly embedder: VoyageEmbedder;
	private readonly collection: string;
	private readonly batchSize: number;
	private readonly checkpointPath: string | undefined;
	private readonly logger: Logger;

	constructor(config: IndexerConfig) {
		this.qdrant = config.qdrant;
		this.embedder = config.embedder;
		this.collection = config.collection;
		this.batchSize = config.batchSize;
		this.checkpointPath = config.checkpointPath;
		this.logger = config.logger ?? new Logger();
	}

	/**
	 * 初始化 collection
	 */
	async initCollection(forceRecreate = false): Promise<void> {
		const exists = await this.qdrant.collectionExists(this.collection);

		if (exists && forceRecreate) {
			this.logger.warn(`Recreating collection: ${this.collection}`);
			await this.qdrant.deleteCollection(this.collection);
		}

		if (!exists || forceRecreate) {
			this.logger.info(`Creating collection: ${this.collection}`);
			const vectorSize = this.embedder.getEmbeddingDim();
			await this.qdrant.createCollection(this.collection, vectorSize);
		}
	}

	/**
	 * 索引 chunks
	 */
	async indexChunks(chunks: Chunk[]): Promise<IndexStats> {
		const startTime = Date.now();

		const checkpoint = await this.loadCheckpoint();
		let resumeFrom = 0;

		if (checkpoint.lastProcessedId) {
			const idx = chunks.findIndex(c => c.id === checkpoint.lastProcessedId);
			if (idx >= 0) {
				resumeFrom = idx + 1;
				this.logger.info(`Resuming from chunk ${resumeFrom} (${checkpoint.lastProcessedId})`);
			}
		}

		let successCount = 0;
		let failedCount = 0;
		const skippedCount = resumeFrom;
		const totalBatches = Math.ceil((chunks.length - resumeFrom) / this.batchSize);

		for (let i = resumeFrom; i < chunks.length; i += this.batchSize) {
			const batch = chunks.slice(i, i + this.batchSize);
			const batchNum = Math.floor((i - resumeFrom) / this.batchSize) + 1;

			try {
				await this.indexBatch(batch);
				successCount += batch.length;

				const lastChunk = batch[batch.length - 1];
				await this.saveCheckpoint(lastChunk.id);

				this.logger.debug(`Indexed batch ${batchNum}/${totalBatches} (${i + batch.length}/${chunks.length})`);
			} catch (error) {
				failedCount += batch.length;
				this.logger.error(`Failed to index batch starting at ${i}:`, error);
				throw error;
			}
		}

		await this.clearCheckpoint();

		return {
			totalChunks: chunks.length,
			successCount,
			failedCount,
			skippedCount,
			durationMs: Date.now() - startTime,
		};
	}

	/**
	 * 索引单批 chunks — payload 中包含 doc_id 和 chunk_index 以支持按文档检索
	 */
	private async indexBatch(chunks: Chunk[]): Promise<void> {
		if (chunks.length === 0) return;

		const texts = chunks.map(c => c.content);
		const embedResults = await this.embedder.embedBatch(texts);

		const points = embedResults.map((er, idx) => {
			const chunk = chunks[idx];
			return {
				id: chunk.id,
				vector: er.embedding,
				payload: {
					content: chunk.content,
					doc_id: chunk.doc_id,
					chunk_index: chunk.chunk_index,
					metadata: chunk.metadata,
				},
			};
		});

		await this.qdrant.upsert(this.collection, points);
	}

	private async loadCheckpoint(): Promise<CheckpointData> {
		if (!this.checkpointPath) {
			return { lastProcessedId: null, timestamp: 0 };
		}
		try {
			const content = await fs.readFile(this.checkpointPath, 'utf-8');
			return JSON.parse(content) as CheckpointData;
		} catch {
			return { lastProcessedId: null, timestamp: 0 };
		}
	}

	private async saveCheckpoint(chunkId: string): Promise<void> {
		if (!this.checkpointPath) return;

		const data: CheckpointData = { lastProcessedId: chunkId, timestamp: Date.now() };
		const dir = join(this.checkpointPath, '..');
		await fs.mkdir(dir, { recursive: true });
		await fs.writeFile(this.checkpointPath, JSON.stringify(data, null, 2));
	}

	private async clearCheckpoint(): Promise<void> {
		if (!this.checkpointPath) return;
		try {
			await fs.unlink(this.checkpointPath);
		} catch {
			// ignored
		}
	}

	async getStats(): Promise<{ pointsCount?: number }> {
		const info = await this.qdrant.getCollectionInfo(this.collection);
		return { pointsCount: info.result?.points_count };
	}

	async deleteChunks(chunkIds: string[]): Promise<void> {
		await this.qdrant.deletePoints(this.collection, chunkIds);
		this.logger.info(`Deleted ${chunkIds.length} chunks`);
	}
}

/**
 * 工厂函数
 */
export interface CreateIndexerOptions {
	qdrantUrl: string;
	qdrantApiKey?: string;
	collection: string;
	embedder: VoyageEmbedder;
	batchSize?: number;
	checkpointPath?: string;
	logger?: Logger;
}

export function createIndexer(options: CreateIndexerOptions): RagIndexer {
	const qdrant = new QdrantClient(options.qdrantUrl, options.qdrantApiKey);

	return new RagIndexer({
		qdrant,
		collection: options.collection,
		embedder: options.embedder,
		batchSize: options.batchSize ?? 100,
		checkpointPath: options.checkpointPath,
		logger: options.logger,
	});
}
