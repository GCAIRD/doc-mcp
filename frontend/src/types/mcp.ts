export interface McpTool {
	name: string;
	description?: string;
	inputSchema?: Record<string, unknown>;
}

export interface McpSearchResult {
	doc_id?: string;
	title?: string;
	name?: string;
	id?: string;
	score?: number;
	similarity?: number;
	relevance?: number;
	content_preview?: string;
	content?: string;
	text?: string;
	snippet?: string;
	metadata?: {
		category?: string;
		file_name?: string;
		path_hierarchy?: string[];
		[key: string]: unknown;
	};
}

export interface McpContent {
	type: string;
	text?: string;
}

export interface McpCallResult {
	content?: McpContent[];
	tools?: McpTool[];
	[key: string]: unknown;
}

export type LogEntryType = 'req' | 'res' | 'err';

export interface LogEntry {
	id: number;
	type: LogEntryType;
	timestamp: Date;
	message: string;
}
