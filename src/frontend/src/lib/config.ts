export const MCP_BASE_URL = `${window.location.origin}/mcp`;

export const PRODUCTS = ['spreadjs', 'gcexcel', 'forguncy', 'wyn'] as const;
export type ProductId = typeof PRODUCTS[number];

export const MCP_URLS: Record<ProductId, string> = {
	spreadjs: `${MCP_BASE_URL}/spreadjs`,
	gcexcel: `${MCP_BASE_URL}/gcexcel`,
	forguncy: `${MCP_BASE_URL}/forguncy`,
	wyn: `${MCP_BASE_URL}/wyn`,
};

// Client categories for Setup Guide
export const CLIENT_CATEGORIES = [
	{ id: 'ide', clients: ['copilot', 'cursor', 'windsurf', 'cline', 'claudedesktop', 'codex', 'jetbrains'] },
	{ id: 'chat', clients: ['lobechat'] },
	{ id: 'general', clients: ['other'] },
] as const;

// Generate MCP config for a specific AI client
export function getClientConfig(client: string, product: ProductId = 'spreadjs'): Record<string, unknown> {
	const url = MCP_URLS[product];
	const serverName = `${product}-mcp`;

	// VS Code Copilot: uses `servers` (not mcpServers), type: "http"
	if (client === 'copilot') {
		return { servers: { [serverName]: { type: 'http', url } } };
	}
	// Cursor: simplified format, just url
	if (client === 'cursor') {
		return { mcpServers: { [serverName]: { url } } };
	}
	// Windsurf: type "streamable-http", url field
	if (client === 'windsurf') {
		return { mcpServers: { [serverName]: { type: 'streamable-http', url } } };
	}
	// Cline: url + transportType
	if (client === 'cline') {
		return { mcpServers: { [serverName]: { url, transportType: 'http' } } };
	}
	// Claude Desktop: config file only supports stdio, use mcp-remote bridge
	if (client === 'claudedesktop') {
		return {
			mcpServers: {
				[serverName]: {
					command: 'npx',
					args: ['-y', 'mcp-remote@latest', url]
				}
			}
		};
	}
	// LobeChat: streamable-http
	if (client === 'lobechat') {
		return { mcpServers: { [serverName]: { type: 'streamable-http', url } } };
	}
	// Default: standard mcpServers format
	return { mcpServers: { [serverName]: { type: 'http', url } } };
}
