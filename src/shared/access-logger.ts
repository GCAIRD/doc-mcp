/**
 * Access Logger — MCP tool call 访问日志
 *
 * 始终输出 JSON Lines 到 stdout（不区分 TTY）
 */

export interface AccessLogEntry {
	ts: string;
	type: 'access';
	requestId: string;
	sessionId: string;
	productId: string;
	client: { name: string; version: string } | null;
	clientIp: string;
	tool: string;
	args: Record<string, unknown>;
	durationMs: number;
	resultCount: number;
	error: string | null;
	search?: {
		fusionMode: string;
		detectedLang: string;
		rerankUsed: boolean;
	};
}

/** 输出一条 access log（JSON Line） */
export function logAccess(entry: AccessLogEntry): void {
	process.stdout.write(JSON.stringify(entry) + '\n');
}
