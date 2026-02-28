import { useState, useRef, useCallback } from 'react';
import { McpClient } from '../lib/mcp-client';
import { MCP_URLS, type ProductId } from '../lib/config';
import type { McpTool, McpSearchResult, LogEntry, LogEntryType } from '../types/mcp';

export interface McpSessionState {
	tools: McpTool[];
	searchResults: McpSearchResult[];
	docContent: string | null;
	logEntries: LogEntry[];
	isSearching: boolean;
	isFetching: boolean;
	isLoadingTools: boolean;
	error: string | null;
	currentProduct: ProductId;
}

export interface McpSessionActions {
	listTools: () => Promise<void>;
	search: (query: string) => Promise<void>;
	fetchDoc: (docId: string) => Promise<void>;
	viewContent: (index: number) => void;
	switchProduct: (productId: ProductId) => void;
	clearDoc: () => void;
}

export function useMcpSession(): McpSessionState & McpSessionActions {
	const [tools, setTools] = useState<McpTool[]>([]);
	const [searchResults, setSearchResults] = useState<McpSearchResult[]>([]);
	const [docContent, setDocContent] = useState<string | null>(null);
	const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [isFetching, setIsFetching] = useState(false);
	const [isLoadingTools, setIsLoadingTools] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [currentProduct, setCurrentProduct] = useState<ProductId>('spreadjs');
	const logIdRef = useRef(0);

	const addLog = useCallback((type: LogEntryType, message: string) => {
		setLogEntries((prev) => [
			...prev,
			{ id: ++logIdRef.current, type, timestamp: new Date(), message },
		]);
	}, []);

	const clientRef = useRef(new McpClient(MCP_URLS.spreadjs, addLog));

	const listTools = useCallback(async () => {
		setIsLoadingTools(true);
		setError(null);
		try {
			const result = await clientRef.current.listTools();
			setTools(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsLoadingTools(false);
		}
	}, []);

	const search = useCallback(async (query: string) => {
		setIsSearching(true);
		setError(null);
		try {
			const results = await clientRef.current.search(query);
			setSearchResults(results);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsSearching(false);
		}
	}, []);

	const fetchDoc = useCallback(async (docId: string) => {
		setIsFetching(true);
		setError(null);
		try {
			const content = await clientRef.current.fetchDoc(docId);
			setDocContent(content);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsFetching(false);
		}
	}, []);

	const viewContent = useCallback(
		(index: number) => {
			const result = searchResults[index];
			if (result) {
				const content = result.content ?? result.text ?? result.snippet ?? result.content_preview ?? '';
				setDocContent(content);
			}
		},
		[searchResults]
	);

	const switchProduct = useCallback((productId: ProductId) => {
		setCurrentProduct(productId);
		clientRef.current.setServerUrl(MCP_URLS[productId]);
		setTools([]);
		setSearchResults([]);
		setDocContent(null);
		setError(null);
	}, []);

	const clearDoc = useCallback(() => setDocContent(null), []);

	return {
		tools,
		searchResults,
		docContent,
		logEntries,
		isSearching,
		isFetching,
		isLoadingTools,
		error,
		currentProduct,
		listTools,
		search,
		fetchDoc,
		viewContent,
		switchProduct,
		clearDoc,
	};
}
