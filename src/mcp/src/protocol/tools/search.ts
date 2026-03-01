/**
 * MCP Tool: search
 */

import type { ResolvedConfig } from '@gc-doc/shared';
import { createDefaultLogger } from '@gc-doc/shared';
import type { ISearcher, SearchResponse } from '../../rag/types.js';
import type { SearchToolResponse } from './types.js';
import { textContent } from '../utils.js';
import { withToolLogging } from './tool-wrapper.js';

const logger = createDefaultLogger('mcp:tool:search');

function formatSearchResponse(response: SearchResponse): SearchToolResponse {
	return {
		query: response.query,
		results: response.results,
		search_time_ms: response.search_time_ms,
		rerank_used: response.rerank_used,
		fusion_mode: response.fusion_mode,
		detected_lang: response.detected_lang,
		doc_language: response.doc_language,
		next_step: "Determine if further queries are needed: If your next code will call APIs mentioned in results and you're not 100% certain of parameter order, types, or return values, you should fetch full docs or search again for that specific API.",
	};
}

/**
 * Create search tool handler
 */
export function createSearchHandler(
	config: ResolvedConfig,
	searcher: ISearcher,
) {
	return withToolLogging(logger, config, async ({ query, limit }: { query: string; limit?: number }) => {
		const searchLimit = limit ?? config.product.search.default_limit;
		const response = await searcher.search(query, searchLimit, true);
		return {
			content: [textContent(JSON.stringify(formatSearchResponse(response), null, 2))],
			meta: {
				resultCount: response.results.length,
				args: { query, limit: searchLimit },
				fusionMode: response.fusion_mode,
				detectedLang: response.detected_lang,
				rerankUsed: response.rerank_used,
			},
		};
	});
}
