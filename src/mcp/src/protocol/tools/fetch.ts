/**
 * MCP Tool: fetch
 */

import type { ResolvedConfig } from '@gc-doc/shared';
import { createDefaultLogger } from '@gc-doc/shared';
import type { ISearcher, DocChunk } from '../../rag/types.js';
import type { FetchToolResponse } from './types.js';
import { textContent } from '../utils.js';
import { withToolLogging } from './tool-wrapper.js';

const logger = createDefaultLogger('mcp:tool:fetch');

function formatDocResponse(docId: string, chunks: DocChunk[]): FetchToolResponse {
	return {
		doc_id: docId,
		chunk_count: chunks.length,
		full_content: chunks.map(c => c.content).join('\n\n'),
		next_step: 'Full document retrieved. If unfamiliar class or method names appear, search for their usage before calling them.',
	};
}

/**
 * Create fetch tool handler
 */
export function createFetchHandler(config: ResolvedConfig, searcher: ISearcher) {
	return withToolLogging(logger, config, async ({ doc_id }: { doc_id: string }) => {
		const chunks = await searcher.getDocChunks(doc_id);
		return {
			content: [textContent(JSON.stringify(formatDocResponse(doc_id, chunks), null, 2))],
			meta: { resultCount: chunks.length, args: { doc_id } },
		};
	});
}
