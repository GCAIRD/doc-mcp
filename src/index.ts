/**
 * GC-DOC-MCP v2 - Application Entry Point
 */

import { getEnv } from './config/env.js';
import { getConfig } from './config/loader.js';
import { createSearcher } from './rag/searcher.js';
import { createVoyageEmbedder } from './rag/embedder.js';
import { createVoyageRateLimiter } from './shared/rate-limiter.js';
import { startServer, stopServer } from './server.js';
import { createDefaultLogger } from './shared/logger.js';
import { ConfigError } from './shared/errors.js';

const logger = createDefaultLogger('MAIN');

async function main(): Promise<void> {
	try {
		const env = getEnv();
		logger.info(`Starting ${env.PRODUCT} (${env.DOC_LANG})...`);

		const config = await getConfig();
		logger.info(`Configuration loaded: ${config.product.name} - ${config.variant.description}`);

		// 创建 RAG searcher
		const rateLimiter = createVoyageRateLimiter(env.VOYAGE_RPM_LIMIT, env.VOYAGE_TPM_LIMIT);
		const embedder = createVoyageEmbedder({
			apiKey: env.VOYAGE_API_KEY,
			model: env.VOYAGE_EMBED_MODEL,
			rateLimiter,
		});

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

		// 启动 HTTP server（内含 MCP server）
		await startServer(config, searcher, env.PORT, env.HOST);
		logger.info(`Server ready at http://${env.HOST}:${env.PORT}`);

		setupShutdownHandlers();
	} catch (err) {
		if (err instanceof Error) {
			logger.error(`Startup failed: ${err.message}`, err);
			if (err instanceof ConfigError) {
				logger.error('Configuration error - check PRODUCT, LANG, and YAML files');
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
