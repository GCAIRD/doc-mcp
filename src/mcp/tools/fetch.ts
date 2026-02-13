/**
 * MCP Tool: fetch
 */

import type { ISearcher, DocChunk } from '../../rag/types.js';
import { createDefaultLogger } from '../../shared/logger.js';
import { SearchError } from '../../shared/errors.js';
import { textContent } from '../utils.js';

const logger = createDefaultLogger('mcp:tool:fetch');

function formatDocChunks(docId: string, chunks: DocChunk[]) {
	return chunks.map((c, i) => textContent(
		i === 0
			? `Document: ${docId}\nTotal chunks: ${chunks.length}\n\n${c.content}`
			: c.content,
	));
}

export function createFetchHandler(searcher: ISearcher) {
	return async ({ doc_id }: { doc_id: string }): Promise<{
		content: Array<{ type: 'text'; text: string }>;
	}> => {
		logger.info('Fetch request', { doc_id });

		try {
			const chunks = await searcher.getDocChunks(doc_id);
			return { content: formatDocChunks(doc_id, chunks) };
		} catch (err) {
			logger.error('Fetch failed', err);
			throw new SearchError('Fetch failed', err as Error);
		}
	};
}
