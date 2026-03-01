// Import from subpath to avoid pulling in Node.js modules via barrel export
export { getClientConfig, getClaudeCodeCommand, CLIENTS } from '@gc-doc/shared/client-configs';
export type { ClientId, ClientMeta } from '@gc-doc/shared/client-configs';

// Client categories for Setup Guide (UI-only concern)
export const CLIENT_CATEGORIES = [
	{ id: 'ide', clients: ['copilot', 'cursor', 'windsurf', 'cline', 'claudedesktop', 'claudecode', 'codex', 'jetbrains'] },
	{ id: 'chat', clients: ['lobechat', 'cherrystudio'] },
	{ id: 'general', clients: ['other'] },
] as const;
