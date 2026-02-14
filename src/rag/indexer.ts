/**
 * RAG 索引构建器
 *
 * Dense embedding (Voyage) + BM25 text inference (Qdrant native)
 * Checkpoint 断点续传
 */

import { QdrantClient, BM25_MODEL, type UpsertPoint } from './qdrant-client.js';
import { VoyageEmbedder } from './embedder.js';
import { Chunk } from '../document/types.js';
import { Logger } from '../shared/logger.js';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface IndexerConfig {
	qdrant: QdrantClient;
	collection: string;
	embedder: VoyageEmbedder;
	batchSize: number;
	checkpointPath?: string;
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
			const progress = ((i - resumeFrom + batch.length) / (chunks.length - resumeFrom) * 100).toFixed(1);

			try {
				await this.indexBatch(batch);
				successCount += batch.length;

				const lastChunk = batch[batch.length - 1];
				await this.saveCheckpoint(lastChunk.id);

				this.logger.info(
					`[${progress}%] batch ${batchNum}/${totalBatches} ` +
					`(${i + batch.length}/${chunks.length} chunks)`,
				);
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
	 * 索引单批 chunks
	 *
	 * 每个 point 包含:
	 * - dense: Voyage embedding
	 * - bm25: 原文文本 (Qdrant 服务端 BM25 推理)
	 */
	private async indexBatch(chunks: Chunk[]): Promise<void> {
		if (chunks.length === 0) return;

		const texts = chunks.map(c => c.content);
		const embedResults = await this.embedder.embedBatch(texts);

		const points: UpsertPoint[] = embedResults.map((er, idx) => {
			const chunk = chunks[idx];
			return {
				id: chunk.id,
				vector: {
					dense: er.embedding,
					bm25: { text: chunk.content, model: BM25_MODEL },
				},
				payload: {
					content: chunk.content,
					doc_id: chunk.doc_id,
					chunk_index: chunk.chunk_index,
					metadata: chunk.metadata,
				},
			};
		});

		// Upsert 分小批写入（每个 point 含全文 BM25 text，payload 较大）
		const upsertBatchSize = 32;
		for (let j = 0; j < points.length; j += upsertBatchSize) {
			await this.qdrant.upsert(this.collection, points.slice(j, j + upsertBatchSize));
		}
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
		return { pointsCount: info.pointsCount ?? undefined };
	}

	async deleteChunks(chunkIds: string[]): Promise<void> {
		await this.qdrant.deletePoints(this.collection, chunkIds);
		this.logger.info(`Deleted ${chunkIds.length} chunks`);
	}
}

/** 工厂函数 */
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
