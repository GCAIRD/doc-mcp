/**
 * 各 AI 客户端的 MCP 配置格式模板
 *
 * 前端（Setup Guide）和后端（markdown for agents）共用
 */

export interface ClientConfigInput {
	endpoint: string;
	serverName: string;
}

const CLIENT_IDS = ['copilot', 'cursor', 'windsurf', 'cline', 'claudedesktop', 'lobechat', 'cherrystudio'] as const;
export type ClientId = typeof CLIENT_IDS[number];

export interface ClientMeta {
	id: ClientId;
	label: string;
	configNote?: string;
}

/** 所有支持的客户端元信息，按展示顺序 */
export const CLIENTS: ClientMeta[] = [
	{ id: 'copilot', label: 'VS Code / GitHub Copilot', configNote: '.vscode/mcp.json' },
	{ id: 'cursor', label: 'Cursor', configNote: 'mcp.json' },
	{ id: 'windsurf', label: 'Windsurf' },
	{ id: 'cline', label: 'Cline' },
	{ id: 'claudedesktop', label: 'Claude Desktop', configNote: 'claude_desktop_config.json, via mcp-remote bridge' },
	{ id: 'lobechat', label: 'LobeChat' },
	{ id: 'cherrystudio', label: 'Cherry Studio' },
];

/** 生成指定客户端的 JSON 配置对象 */
export function getClientConfig(client: string, { endpoint, serverName }: ClientConfigInput): Record<string, unknown> {
	switch (client) {
		case 'copilot':
			return { servers: { [serverName]: { type: 'http', url: endpoint } } };
		case 'cursor':
			return { mcpServers: { [serverName]: { url: endpoint } } };
		case 'windsurf':
			return { mcpServers: { [serverName]: { type: 'streamable-http', url: endpoint } } };
		case 'cline':
			return { mcpServers: { [serverName]: { url: endpoint, transportType: 'http' } } };
		case 'claudedesktop':
			return { mcpServers: { [serverName]: { command: 'npx', args: ['-y', 'mcp-remote@latest', endpoint] } } };
		case 'cherrystudio':
			return { mcpServers: { [serverName]: { type: 'streamableHttp', url: endpoint } } };
		default:
			return { mcpServers: { [serverName]: { type: 'http', url: endpoint } } };
	}
}

/** 生成 Claude Code CLI 命令 */
export function getClaudeCodeCommand(productId: string, endpoint: string): string {
	return `claude mcp add ${productId}-docs --transport http ${endpoint}`;
}
