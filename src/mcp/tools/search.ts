/**
 * MCP Tool: search
 */

import type { ResolvedConfig } from '../../config/types.js';
import type { ISearcher, SearchResponse } from '../../rag/types.js';
import { createDefaultLogger } from '../../shared/logger.js';
import { SearchError } from '../../shared/errors.js';
import { textContent } from '../utils.js';

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
		logger.info('Search request', { query, limit });

		try {
			const searchLimit = limit ?? config.product.search.default_limit;
			const response = await searcher.search(query, searchLimit, true);
			return { content: formatSearchResponse(response) };
		} catch (err) {
			logger.error('Search failed', err);
			throw new SearchError('Search failed', err as Error);
		}
	};
}
