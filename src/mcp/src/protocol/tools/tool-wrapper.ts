/**
 * Tool logging wrapper — unified logging for all MCP tool handlers
 *
 * Wraps a tool handler to automatically log every call with:
 * request context (requestId, sessionId, client, etc.), timing, result count, and errors.
 *
 * Tool-specific fields (args, search metadata, etc.) are provided by each handler via `meta`.
 */

import type { Logger, ResolvedConfig } from '@gc-doc/shared';
import { requestContext } from '../../request-context.js';

interface ToolResult {
	content: Array<{ type: 'text'; text: string }>;
	meta: {
		resultCount: number;
		[key: string]: unknown;
	};
}

/**
 * Wraps a tool handler with automatic logging.
 *
 * The inner function returns `content` (MCP response) and `meta` (fields to log).
 * The wrapper handles timing, context extraction, and success/error logging.
 * Tool-specific data (args, search info, etc.) should be included in `meta` by each handler.
 */
export function withToolLogging<TArgs>(
	logger: Logger,
	config: ResolvedConfig,
	fn: (args: TArgs) => Promise<ToolResult>,
) {
	return async (args: TArgs): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
		const ctx = requestContext.getStore();
		const start = Date.now();

		try {
			const { content, meta } = await fn(args);
			const { resultCount, ...extra } = meta;
			logger.info('tool call', {
				requestId: ctx?.requestId ?? '-',
				sessionId: ctx?.sessionId ?? '-',
				productId: config.product.id,
				client: ctx?.clientInfo ?? null,
				clientIp: ctx?.clientIp ?? 'unknown',
				durationMs: Date.now() - start,
				resultCount,
				...extra,
			});
			return { content };
		} catch (err) {
			logger.error('tool call', {
				requestId: ctx?.requestId ?? '-',
				sessionId: ctx?.sessionId ?? '-',
				productId: config.product.id,
				client: ctx?.clientInfo ?? null,
				clientIp: ctx?.clientIp ?? 'unknown',
				durationMs: Date.now() - start,
				resultCount: 0,
				error: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	};
}
