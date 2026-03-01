// Client categories for Setup Guide
export const CLIENT_CATEGORIES = [
	{ id: 'ide', clients: ['copilot', 'cursor', 'windsurf', 'cline', 'claudedesktop', 'claudecode', 'codex', 'jetbrains'] },
	{ id: 'chat', clients: ['lobechat', 'cherrystudio'] },
	{ id: 'general', clients: ['other'] },
] as const;

// Generate MCP config for a specific AI client
export function getClientConfig(client: string, endpoint: string, serverName: string): Record<string, unknown> {
	// VS Code Copilot: uses `servers` (not mcpServers), type: "http"
	if (client === 'copilot') {
		return { servers: { [serverName]: { type: 'http', url: endpoint } } };
	}
	// Cursor: simplified format, just url
	if (client === 'cursor') {
		return { mcpServers: { [serverName]: { url: endpoint } } };
	}
	// Windsurf: type "streamable-http", url field
	if (client === 'windsurf') {
		return { mcpServers: { [serverName]: { type: 'streamable-http', url: endpoint } } };
	}
	// Cline: url + transportType
	if (client === 'cline') {
		return { mcpServers: { [serverName]: { url: endpoint, transportType: 'http' } } };
	}
	// Claude Desktop: config file only supports stdio, use mcp-remote bridge
	if (client === 'claudedesktop') {
		return {
			mcpServers: {
				[serverName]: {
					command: 'npx',
					args: ['-y', 'mcp-remote@latest', endpoint]
				}
			}
		};
	}
	// LobeChat: streamable-http
	if (client === 'lobechat') {
		return { mcpServers: { [serverName]: { type: 'streamable-http', url: endpoint } } };
	}
	// Cherry Studio: streamableHttp (no hyphen)
	if (client === 'cherrystudio') {
		return { mcpServers: { [serverName]: { type: 'streamableHttp', url: endpoint } } };
	}
	// Default: standard mcpServers format
	return { mcpServers: { [serverName]: { type: 'http', url: endpoint } } };
}
