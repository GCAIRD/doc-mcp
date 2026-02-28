/**
 * MCP 工具共享 utilities
 */

/** 构建 MCP text content 块 */
export function textContent(text: string): { type: 'text'; text: string } {
	return { type: 'text', text };
}
