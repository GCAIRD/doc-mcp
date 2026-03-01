/**
 * MCP Tool: get_code_guidelines
 * 返回 CDN scripts 和 npm packages 等资源引用信息
 */

import type { ResolvedConfig } from '@gc-doc/shared';
import { createDefaultLogger } from '@gc-doc/shared';
import type { GuidelinesToolResponse } from './types.js';
import { textContent } from '../utils.js';
import { requestContext } from '../../request-context.js';
import { logAccess } from '../../access-logger.js';

const logger = createDefaultLogger('mcp:tool:guidelines');

function formatGuidelines(config: ResolvedConfig): GuidelinesToolResponse {
	const guidelines: GuidelinesToolResponse['guidelines'] = {};
	for (const [key, resource] of Object.entries(config.variant.resources)) {
		guidelines[key] = {
			name: resource.name,
			description: resource.description,
			content: resource.content,
		};
	}
	return { guidelines };
}

export function createGuidelinesHandler(config: ResolvedConfig) {
	return async () => {
		const ctx = requestContext.getStore();
		const start = Date.now();
		logger.info('Guidelines request');

		const response = formatGuidelines(config);
		const resultCount = Object.keys(response.guidelines).length;

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

		return { content: [textContent(JSON.stringify(response, null, 2))] };
	};
}
