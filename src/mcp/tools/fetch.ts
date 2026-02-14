/**
 * MCP Tool: fetch
 */

import type { ResolvedConfig } from '../../config/types.js';
import type { ISearcher, DocChunk } from '../../rag/types.js';
import { createDefaultLogger } from '../../shared/logger.js';
import { SearchError } from '../../shared/errors.js';
import { textContent } from '../utils.js';
import { requestContext } from '../../shared/request-context.js';
import { logAccess } from '../../shared/access-logger.js';

const logger = createDefaultLogger('mcp:tool:fetch');

function formatDocChunks(docId: string, chunks: DocChunk[]) {
	return chunks.map((c, i) => textContent(
		i === 0
			? `Document: ${docId}\nTotal chunks: ${chunks.length}\n\n${c.content}`
			: c.content,
	));
}

export function createFetchHandler(config: ResolvedConfig, searcher: ISearcher) {
	return async ({ doc_id }: { doc_id: string }): Promise<{
		content: Array<{ type: 'text'; text: string }>;
	}> => {
		const ctx = requestContext.getStore();
		const start = Date.now();
		logger.info('Fetch request', { doc_id });

		try {
			const chunks = await searcher.getDocChunks(doc_id);

			logAccess({
				ts: new Date().toISOString(),
				type: 'access',
				requestId: ctx?.requestId ?? '-',
				sessionId: ctx?.sessionId ?? '-',
				productId: config.product.id,
				client: ctx?.clientInfo ?? null,
				clientIp: ctx?.clientIp ?? 'unknown',
				tool: 'fetch',
				args: { doc_id },
				durationMs: Date.now() - start,
				resultCount: chunks.length,
				error: null,
			});

			return { content: formatDocChunks(doc_id, chunks) };
		} catch (err) {
			logAccess({
				ts: new Date().toISOString(),
				type: 'access',
				requestId: ctx?.requestId ?? '-',
				sessionId: ctx?.sessionId ?? '-',
				productId: config.product.id,
				client: ctx?.clientInfo ?? null,
				clientIp: ctx?.clientIp ?? 'unknown',
				tool: 'fetch',
				args: { doc_id },
				durationMs: Date.now() - start,
				resultCount: 0,
				error: (err as Error).message,
			});

			logger.error('Fetch failed', { error: (err as Error).message });
			throw new SearchError('Fetch failed', err as Error);
		}
	};
}
