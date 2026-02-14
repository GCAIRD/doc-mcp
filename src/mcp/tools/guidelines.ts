/**
 * MCP Tool: get_code_guidelines
 * 返回 CDN scripts 和 npm packages 等资源引用信息
 */

import type { ResolvedConfig } from '../../config/types.js';
import { createDefaultLogger } from '../../shared/logger.js';
import { textContent } from '../utils.js';
import { requestContext } from '../../shared/request-context.js';
import { logAccess } from '../../shared/access-logger.js';

const logger = createDefaultLogger('mcp:tool:guidelines');

export function createGuidelinesHandler(config: ResolvedConfig) {
	return async () => {
		const ctx = requestContext.getStore();
		const start = Date.now();
		logger.info('Guidelines request');

		const parts = Object.values(config.variant.resources).map(
			(resource) => textContent(`## ${resource.name}\n${resource.content}`),
		);

		if (parts.length === 0) {
			parts.push(textContent('No CDN/npm guidelines configured for this product.'));
		}

		const resultCount = Object.keys(config.variant.resources).length;

		logAccess({
			ts: new Date().toISOString(),
			type: 'access',
			requestId: ctx?.requestId ?? '-',
			sessionId: ctx?.sessionId ?? '-',
			productId: config.product.id,
			client: ctx?.clientInfo ?? null,
			clientIp: ctx?.clientIp ?? 'unknown',
			tool: 'get_code_guidelines',
			args: {},
			durationMs: Date.now() - start,
			resultCount,
			error: null,
		});

		return { content: parts };
	};
}
