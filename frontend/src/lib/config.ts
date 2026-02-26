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
	{ id: 'ide', clients: ['copilot', 'cursor', 'windsurf', 'cline', 'trae', 'jetbrains'] },
	{ id: 'chat', clients: ['cherrystudio', 'lobechat'] },
	{ id: 'general', clients: ['other'] },
] as const;

// Generate MCP config for a specific AI client
export function getClientConfig(client: string, product: ProductId = 'spreadjs'): Record<string, unknown> {
	const url = MCP_URLS[product];
	const serverName = `${product}-mcp`;

	if (client === 'copilot') {
		return { servers: { [serverName]: { type: 'http', url } } };
	}
	if (client === 'windsurf') {
		return { mcpServers: { [serverName]: { serverUrl: url } } };
	}
	if (client === 'trae') {
		return { mcpServers: [{ name: serverName, url, type: 'sse' }] };
	}
	if (client === 'cherrystudio') {
		return { mcpServers: { [serverName]: { type: 'streamableHttp', url } } };
	}
	if (client === 'lobechat') {
		return { mcpServers: { [serverName]: { type: 'http', url } } };
	}
	return { mcpServers: { [serverName]: { type: 'http', url } } };
}
