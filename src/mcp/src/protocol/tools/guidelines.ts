/**
 * MCP Tool: get_code_guidelines
 * Returns CDN scripts and npm package reference information
 */

import type { ResolvedConfig } from '@gc-doc/shared';
import { createDefaultLogger } from '@gc-doc/shared';
import type { GuidelinesToolResponse } from './types.js';
import { textContent } from '../utils.js';
import { withToolLogging } from './tool-wrapper.js';

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

/**
 * Create get_code_guidelines tool handler
 */
export function createGuidelinesHandler(config: ResolvedConfig) {
	return withToolLogging(logger, config, async () => {
		const response = formatGuidelines(config);
		return {
			content: [textContent(JSON.stringify(response, null, 2))],
			meta: { resultCount: Object.keys(response.guidelines).length },
		};
	});
}
