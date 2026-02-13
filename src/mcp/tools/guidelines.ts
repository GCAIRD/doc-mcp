/**
 * MCP Tool: get_code_guidelines
 * 返回 CDN scripts 和 npm packages 等资源引用信息
 */

import type { ResolvedConfig } from '../../config/types.js';
import { createDefaultLogger } from '../../shared/logger.js';
import { textContent } from '../utils.js';

const logger = createDefaultLogger('mcp:tool:guidelines');

export function createGuidelinesHandler(config: ResolvedConfig) {
	return async () => {
		logger.info('Guidelines request');

		const parts = Object.values(config.variant.resources).map(
			(resource) => textContent(`## ${resource.name}\n${resource.content}`),
		);

		if (parts.length === 0) {
			parts.push(textContent('No CDN/npm guidelines configured for this product.'));
		}

		return { content: parts };
	};
}
