/**
 * MCP Instructions 动态构建
 * 根据产品配置生成 AI 助手的指令（产品特化指令从 YAML 读取）
 */

import type { ResolvedConfig } from '../config/types.js';

/**
 * 通用指令模板
 */
function buildBaseInstructions(description: string, productSpecific: string): string {
	return `This server is a documentation knowledge base for ${description}. It provides RAG-powered search over API docs, code examples, tutorials, and feature guides.

Tools:
- search: Query documentation using natural language. Returns ranked summaries with doc_id.
- fetch: Retrieve full document content by doc_id from search results.
- get_code_guidelines: Get CDN/npm import paths. Call BEFORE generating any code with script tags or imports.

Workflow:
1. Search with a natural language question describing what you need.
2. Review summaries. Fetch full doc if a result looks relevant.
3. Call get_code_guidelines before generating code with imports/script refs.
4. Never assume API signatures from memory - always verify via search.

${productSpecific}`;
}

/**
 * 构建 MCP Instructions
 * 产品特化指令从 product.yaml 的 instructions 字段读取
 */
export function buildInstructions(config: ResolvedConfig): string {
	const description = config.variant.description;
	const productSpecific = config.product.instructions ?? '';
	return buildBaseInstructions(description, productSpecific);
}
