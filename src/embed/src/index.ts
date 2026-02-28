/**
 * Embedding 脚本 — 读取 raw_data，分块，向量化，写入 Qdrant
 *
 * 用法:
 *   npm run embed                          # 索引 .env 中 PRODUCT 指定的所有产品
 *   npm run embed -- --product spreadjs    # 仅索引 spreadjs
 *   npm run embed -- --force               # 强制重建 collection（删除旧数据）
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
	loadConfig,
	getEnv,
	createVoyageEmbedder,
	createVoyageRateLimiter,
	createDefaultLogger,
} from '@gc-doc/shared';
import { DocumentLoader } from './document/loader.js';
import { createChunker } from './document/chunker.js';
import { createIndexer } from './indexer.js';

const logger = createDefaultLogger('EMBED');
const __dirname = dirname(fileURLToPath(import.meta.url));
const EMBED_ROOT = join(__dirname, '..');

const { values: args } = parseArgs({
	options: {
		product: { type: 'string', short: 'p' },
		force: { type: 'boolean', short: 'f', default: false },
	},
	strict: false,
}) as { values: { product?: string; force?: boolean } };

async function embedProduct(
	productId: string,
	lang: string,
	embedder: ReturnType<typeof createVoyageEmbedder>,
	force: boolean,
): Promise<void> {
	const config = await loadConfig(productId, lang);
	const rawDataDir = join(EMBED_ROOT, 'raw_data', config.variant.raw_data);

	logger.info(`=== ${config.product.name} (${config.variant.collection}) ===`);
	logger.info(`Raw data: ${rawDataDir}`);
	logger.info(`Subdirs: ${config.product.doc_subdirs.join(', ')}`);

	// 1. 加载文档
	const loader = new DocumentLoader(rawDataDir);
	const docs = await loader.loadAll(config.product.doc_subdirs);
	logger.info(`Loaded ${docs.length} documents`);

	if (docs.length === 0) {
		logger.warn('No documents found, skipping');
		return;
	}

	// 2. 分块
	const env = getEnv();
	const chunker = createChunker(config.product.chunker, {
		chunk_size: env.CHUNK_SIZE,
		min_chunk_size: 50,
	});

	const allChunks = chunker.chunkDocuments(docs);
	logger.info(`Generated ${allChunks.length} chunks from ${docs.length} documents`);

	// 3. 索引
	const indexer = createIndexer({
		qdrantUrl: env.QDRANT_URL,
		qdrantApiKey: env.QDRANT_API_KEY,
		collection: config.variant.collection,
		embedder,
		batchSize: env.BATCH_SIZE,
		checkpointPath: join(EMBED_ROOT, 'checkpoints', `checkpoint-${productId}.json`),
		logger,
	});

	await indexer.initCollection(force);

	const stats = await indexer.indexChunks(allChunks);
	const elapsed = (stats.durationMs / 1000).toFixed(1);

	logger.info(
		`Done: ${stats.successCount} indexed, ${stats.skippedCount} skipped, ` +
		`${stats.failedCount} failed (${elapsed}s)`,
	);

	const info = await indexer.getStats();
	logger.info(`Collection ${config.variant.collection}: ${info.pointsCount ?? '?'} points total`);
}

async function main(): Promise<void> {
	const env = getEnv();

	const productIds = typeof args.product === 'string'
		? [args.product]
		: env.PRODUCT.split(',').map(p => p.trim()).filter(Boolean);

	const force = args.force ?? false;

	logger.info(`Products: [${productIds.join(', ')}], lang: ${env.DOC_LANG}, force: ${force}`);

	const rateLimiter = createVoyageRateLimiter(env.VOYAGE_RPM_LIMIT, env.VOYAGE_TPM_LIMIT);
	const embedder = createVoyageEmbedder({
		apiKey: env.VOYAGE_API_KEY,
		model: env.VOYAGE_EMBED_MODEL,
		rateLimiter,
	});

	for (const productId of productIds) {
		await embedProduct(productId, env.DOC_LANG, embedder, force);
	}

	logger.info('All done.');
}

main().catch(err => {
	logger.error('Embed failed', { error: err instanceof Error ? err.message : String(err) });
	process.exit(1);
});
