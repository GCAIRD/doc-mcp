/**
 * GC-DOC-MCP v2 - Application Entry Point
 */

import { getEnv } from './config/env.js';
import { loadConfig, getVersion } from './config/loader.js';
import { createSearcher } from './rag/searcher.js';
import { createVoyageEmbedder } from './rag/embedder.js';
import { createVoyageRateLimiter } from './shared/rate-limiter.js';
import { startServer, stopServer } from './server.js';
import type { ProductEntry } from './server.js';
import { createDefaultLogger } from './shared/logger.js';
import { ConfigError } from './shared/errors.js';

const logger = createDefaultLogger('MAIN');

async function main(): Promise<void> {
	try {
		const env = getEnv();
		const productIds = env.PRODUCT.split(',').map((p) => p.trim()).filter(Boolean);
		logger.info(`Starting products: [${productIds.join(', ')}] (${env.DOC_LANG})...`);

		// 共享 embedder 和 rate limiter
		const rateLimiter = createVoyageRateLimiter(env.VOYAGE_RPM_LIMIT, env.VOYAGE_TPM_LIMIT);
		const embedder = createVoyageEmbedder({
			apiKey: env.VOYAGE_API_KEY,
			model: env.VOYAGE_EMBED_MODEL,
			rateLimiter,
		});

		// 为每个产品加载配置并创建 searcher
		const products: ProductEntry[] = await Promise.all(
			productIds.map(async (productId) => {
				const config = await loadConfig(productId, env.DOC_LANG);
				const searcher = createSearcher({
					qdrantUrl: env.QDRANT_URL,
					qdrantApiKey: env.QDRANT_API_KEY,
					collection: config.variant.collection,
					docLanguage: config.variant.doc_language,
					embedder,
					rerankModel: env.VOYAGE_RERANK_MODEL,
					voyageApiKey: env.VOYAGE_API_KEY,
					prefetchLimit: config.product.search.prefetch_limit,
					rerankTopK: config.product.search.rerank_top_k,
					denseScoreThreshold: config.product.search.dense_score_threshold,
				});
				logger.info(`Loaded: ${config.product.name} (${config.variant.collection})`);
				return { config, searcher };
			}),
		);

		const version = await getVersion();
		await startServer(products, env.PORT, env.HOST, version);
		logger.info(`Server ready at http://${env.HOST}:${env.PORT}`);

		setupShutdownHandlers();
	} catch (err) {
		if (err instanceof Error) {
			logger.error(`Startup failed: ${err.message}`, err);
			if (err instanceof ConfigError) {
				logger.error('Configuration error - check PRODUCT, DOC_LANG, and YAML files');
			}
		}
		process.exit(1);
	}
}

function setupShutdownHandlers(): void {
	const shutdown = async (signal: string): Promise<void> => {
		logger.info(`Received ${signal}, shutting down...`);
		try {
			await stopServer();
			logger.info('Shutdown complete');
			process.exit(0);
		} catch (err) {
			logger.error('Shutdown error', err);
			process.exit(1);
		}
	};

	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
