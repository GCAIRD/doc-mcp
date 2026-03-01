import { useState, useRef, useCallback, useEffect } from 'react';
import { McpClient } from '../lib/mcp-client';
import { useActiveProducts } from './useActiveProducts';
import { useVersion } from './useHealth';
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
	currentProduct: string;
}

export interface McpSessionActions {
	listTools: () => Promise<void>;
	search: (query: string) => Promise<void>;
	fetchDoc: (docId: string) => Promise<void>;
	viewContent: (index: number) => void;
	switchProduct: (productId: string) => void;
	clearDoc: () => void;
}

export function useMcpSession(): McpSessionState & McpSessionActions {
	const products = useActiveProducts();
	const version = useVersion();
	const [tools, setTools] = useState<McpTool[]>([]);
	const [searchResults, setSearchResults] = useState<McpSearchResult[]>([]);
	const [docContent, setDocContent] = useState<string | null>(null);
	const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [isFetching, setIsFetching] = useState(false);
	const [isLoadingTools, setIsLoadingTools] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [currentProduct, setCurrentProduct] = useState('');
	const logIdRef = useRef(0);

	const addLog = useCallback((type: LogEntryType, message: string) => {
		setLogEntries((prev) => [
			...prev,
			{ id: ++logIdRef.current, type, timestamp: new Date(), message },
		]);
	}, []);

	const clientRef = useRef<McpClient | null>(null);

	// 首个产品加载后初始化 client
	useEffect(() => {
		if (products.length > 0 && !clientRef.current) {
			clientRef.current = new McpClient(products[0].endpoint, version, addLog);
			setCurrentProduct(products[0].id);
		}
	}, [products, version, addLog]);

	const listTools = useCallback(async () => {
		if (!clientRef.current) return;
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
		if (!clientRef.current) return;
		setIsSearching(true);
		setError(null);
		setSearchResults([]);
		setDocContent(null);
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
		if (!clientRef.current) return;
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

	const switchProduct = useCallback((productId: string) => {
		const p = products.find((p) => p.id === productId);
		if (!p) return;
		setCurrentProduct(productId);
		if (clientRef.current) {
			clientRef.current.setServerUrl(p.endpoint);
		} else {
			clientRef.current = new McpClient(p.endpoint, version, addLog);
		}
		setTools([]);
		setSearchResults([]);
		setDocContent(null);
		setError(null);
	}, [products, version, addLog]);

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
