/**
 * MCP Tool: search
 */

import type { ResolvedConfig } from '@gc-doc/shared';
import { createDefaultLogger, SearchError } from '@gc-doc/shared';
import type { ISearcher, SearchResponse } from '../../rag/types.js';
import { textContent } from '../utils.js';
import { requestContext } from '../../request-context.js';
import { logAccess } from '../../access-logger.js';

const logger = createDefaultLogger('mcp:tool:search');

function formatSearchResponse(response: SearchResponse) {
	return [
		textContent(JSON.stringify({
			query: response.query,
			results: response.results,
			search_time_ms: response.search_time_ms,
			rerank_used: response.rerank_used,
			fusion_mode: response.fusion_mode,
			detected_lang: response.detected_lang,
			doc_language: response.doc_language,
		}, null, 2)),
	];
}

/**
 * 创建 search tool handler（兼容 server.tool() 回调签名）
 */
export function createSearchHandler(
	config: ResolvedConfig,
	searcher: ISearcher,
) {
	return async ({ query, limit }: { query: string; limit?: number }): Promise<{
		content: Array<{ type: 'text'; text: string }>;
	}> => {
		const ctx = requestContext.getStore();
		const start = Date.now();
		logger.info('Search request', { query, limit });

		try {
			const searchLimit = limit ?? config.product.search.default_limit;
			const response = await searcher.search(query, searchLimit, true);

			logAccess({
				ts: new Date().toISOString(),
				type: 'access',
				requestId: ctx?.requestId ?? '-',
				sessionId: ctx?.sessionId ?? '-',
				productId: config.product.id,
				client: ctx?.clientInfo ?? null,
				clientIp: ctx?.clientIp ?? 'unknown',
				tool: 'search',
				args: { query, limit: searchLimit },
				durationMs: Date.now() - start,
				resultCount: response.results.length,
				error: null,
				search: {
					fusionMode: response.fusion_mode,
					detectedLang: response.detected_lang,
					rerankUsed: response.rerank_used,
				},
			});

			return { content: formatSearchResponse(response) };
		} catch (err) {
			logAccess({
				ts: new Date().toISOString(),
				type: 'access',
				requestId: ctx?.requestId ?? '-',
				sessionId: ctx?.sessionId ?? '-',
				productId: config.product.id,
				client: ctx?.clientInfo ?? null,
				clientIp: ctx?.clientIp ?? 'unknown',
				tool: 'search',
				args: { query, limit },
				durationMs: Date.now() - start,
				resultCount: 0,
				error: (err as Error).message,
			});

			logger.error('Search failed', { error: (err as Error).message });
			throw new SearchError('Search failed', err as Error);
		}
	};
}
