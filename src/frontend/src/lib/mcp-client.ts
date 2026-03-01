import type { McpTool, McpCallResult, McpSearchResult, LogEntryType } from '../types/mcp';

const PROTOCOL_VERSION = '2025-03-26';
const CLIENT_INFO = { name: 'RAG Playground', version: '1.0.0' };

const SEARCH_TOOL_KEYWORDS = ['search', 'query', 'retrieve', 'rag'];
const SEARCH_PARAM_NAMES = ['query', 'q', 'question', 'text', 'search', 'keyword'];
const FETCH_TOOL_KEYWORDS = ['get_doc', 'fetch_doc', 'read'];
const DOC_ID_PARAM_NAMES = ['doc_id', 'id', 'document_id', 'docId'];

export class McpClient {
	private sessionId: string | null = null;
	private requestId = 0;
	private serverUrl: string;
	private onLog?: (type: LogEntryType, message: string) => void;

	constructor(serverUrl: string, onLog?: (type: LogEntryType, message: string) => void) {
		this.serverUrl = serverUrl;
		this.onLog = onLog;
	}

	setServerUrl(url: string): void {
		this.serverUrl = url;
		this.sessionId = null;
		this.requestId = 0;
	}

	/** Send initialize + notifications/initialized to establish a session. */
	async ensureSession(): Promise<void> {
		if (this.sessionId) return;

		const initResult = await this.rawCall('initialize', {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: CLIENT_INFO,
		});

		if (!this.sessionId) {
			throw new Error('Server did not return mcp-session-id header');
		}

		this.log('res', `Session established: ${this.sessionId}\n${JSON.stringify(initResult, null, 2)}`);

		// Fire-and-forget initialized notification (no id = notification)
		await this.rawNotification('notifications/initialized', {});
	}

	/** JSON-RPC call with auto-retry on 400/404 (session expired). */
	async call(method: string, params: Record<string, unknown> = {}): Promise<McpCallResult> {
		await this.ensureSession();

		try {
			return await this.rawCall(method, params);
		} catch (err) {
			if (err instanceof SessionError) {
				this.log('err', `Session invalid (${err.status}), re-initializing...`);
				this.sessionId = null;
				await this.ensureSession();
				return await this.rawCall(method, params);
			}
			throw err;
		}
	}

	/** List available MCP tools. */
	async listTools(): Promise<McpTool[]> {
		const result = await this.call('tools/list');
		return (result.tools ?? []) as McpTool[];
	}

	/** Smart search: auto-detect search tool and query param. */
	async search(query: string): Promise<McpSearchResult[]> {
		const tools = await this.listTools();
		const tool = findTool(tools, SEARCH_TOOL_KEYWORDS);
		if (!tool) throw new Error('No search tool found on this server');

		const paramName = findParamName(tool, SEARCH_PARAM_NAMES);
		const result = await this.call('tools/call', {
			name: tool.name,
			arguments: { [paramName]: query },
		});

		return parseSearchResults(result);
	}

	/** Fetch a full document by doc_id. */
	async fetchDoc(docId: string): Promise<string> {
		const tools = await this.listTools();
		const tool = tools.find(t =>
			t.name === 'fetch' || FETCH_TOOL_KEYWORDS.some(k => t.name.includes(k))
		);
		if (!tool) throw new Error('No fetch tool found on this server');

		const paramName = findParamName(tool, DOC_ID_PARAM_NAMES);
		const result = await this.call('tools/call', {
			name: tool.name,
			arguments: { [paramName]: docId },
		});

		// Extract text content from response
		if (result.content && Array.isArray(result.content)) {
			const text = result.content
				.filter((c) => c.type === 'text' && c.text)
				.map((c) => c.text)
				.join('\n');

			// Try parsing as JSON to extract full_content (structured response)
			try {
				const parsed = JSON.parse(text);
				if (parsed.full_content) return parsed.full_content;
			} catch {
				// Not JSON, use as-is (plain text / multi-chunk response)
			}

			return text;
		}
		return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
	}

	/** Format doc_id for display: underscores to slashes, strip chunk suffix. */
	static formatDocId(docId: string): string {
		return docId
			.replace(/_/g, ' / ')
			.replace(/\s*\/\s*chunk\d+/gi, '')
			.replace(/\s*\/\s*$/, '');
	}

	// ── Internal ──────────────────────────────────────────────

	private log(type: LogEntryType, message: string): void {
		this.onLog?.(type, message);
	}

	/** Raw JSON-RPC request (with id). */
	private async rawCall(method: string, params: Record<string, unknown>): Promise<McpCallResult> {
		const id = ++this.requestId;
		const body = { jsonrpc: '2.0', id, method, params };

		this.log('req', `${method}\n${JSON.stringify(params, null, 2)}`);

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Accept': 'application/json, text/event-stream',
		};
		if (this.sessionId) {
			headers['Mcp-Session-Id'] = this.sessionId;
		}

		const res = await fetch(this.serverUrl, { method: 'POST', headers, body: JSON.stringify(body) });

		// Capture session id from response
		const sid = res.headers.get('mcp-session-id');
		if (sid) this.sessionId = sid;

		if (res.status === 400 || res.status === 404) {
			throw new SessionError(res.status);
		}
		if (!res.ok) {
			const text = await res.text();
			this.log('err', `HTTP ${res.status}: ${text}`);
			throw new Error(`HTTP ${res.status}: ${text}`);
		}

		const json = await res.json();

		if (json.error) {
			const errMsg = `JSON-RPC error ${json.error.code}: ${json.error.message}`;
			this.log('err', errMsg);
			throw new Error(errMsg);
		}

		const result = json.result ?? json;
		this.log('res', `${method}\n${JSON.stringify(result, null, 2)}`);
		return result;
	}

	/** Raw JSON-RPC notification (no id, no response expected). */
	private async rawNotification(method: string, params: Record<string, unknown>): Promise<void> {
		const body = { jsonrpc: '2.0', method, params };
		this.log('req', `${method} (notification)`);

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Accept': 'application/json, text/event-stream',
		};
		if (this.sessionId) {
			headers['Mcp-Session-Id'] = this.sessionId;
		}

		await fetch(this.serverUrl, { method: 'POST', headers, body: JSON.stringify(body) });
	}
}

// ── Helpers ──────────────────────────────────────────────────

class SessionError extends Error {
	status: number;
	constructor(status: number) {
		super(`Session expired (HTTP ${status})`);
		this.status = status;
	}
}

/** Find a tool whose name matches any of the keywords. */
function findTool(tools: McpTool[], keywords: string[]): McpTool | undefined {
	return tools.find(t => keywords.some(k => t.name.includes(k)));
}

/** Find the best parameter name from a tool's input schema, with fallback to first property. */
function findParamName(tool: McpTool, candidates: string[]): string {
	const props = (tool.inputSchema?.properties ?? {}) as Record<string, unknown>;
	const keys = Object.keys(props);

	for (const name of candidates) {
		if (keys.includes(name)) return name;
	}
	// Fallback: first property
	return keys[0] ?? candidates[0];
}

/** Parse search results from various MCP response formats. */
function parseSearchResults(result: McpCallResult): McpSearchResult[] {
	// Format 1: result.content[].text containing JSON
	if (result.content && Array.isArray(result.content)) {
		for (const item of result.content) {
			if (item.type === 'text' && item.text) {
				try {
					const parsed = JSON.parse(item.text);
					if (Array.isArray(parsed)) return parsed;
					if (parsed.results && Array.isArray(parsed.results)) return parsed.results;
					if (parsed.documents && Array.isArray(parsed.documents)) return parsed.documents;
					// Single object — wrap
					return [parsed];
				} catch {
					// Not JSON, skip
				}
			}
		}
	}

	// Format 2: result.results array
	const asAny = result as Record<string, unknown>;
	if (Array.isArray(asAny.results)) return asAny.results as McpSearchResult[];

	// Format 3: result.documents array
	if (Array.isArray(asAny.documents)) return asAny.documents as McpSearchResult[];

	// Format 4: result itself is array
	if (Array.isArray(result)) return result as McpSearchResult[];

	return [];
}
