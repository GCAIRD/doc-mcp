import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ProductSelector from '../../components/ProductSelector';
import ToolChip from '../../components/ToolChip';
import SearchResultCard from '../../components/SearchResultCard';
import type { ProductId } from '../../lib/config';
import type { McpTool, McpSearchResult } from '../../types/mcp';

interface SearchPanelProps {
	tools: McpTool[];
	searchResults: McpSearchResult[];
	isSearching: boolean;
	isLoadingTools: boolean;
	currentProduct: ProductId;
	error: string | null;
	onListTools: () => void;
	onSearch: (query: string) => void;
	onViewContent: (index: number) => void;
	onFetchDoc: (docId: string) => void;
	onSwitchProduct: (productId: ProductId) => void;
	onShowToolInfo: (tool: McpTool) => void;
}

export default function SearchPanel({
	tools,
	searchResults,
	isSearching,
	isLoadingTools,
	currentProduct,
	error,
	onListTools,
	onSearch,
	onViewContent,
	onFetchDoc,
	onSwitchProduct,
	onShowToolInfo,
}: SearchPanelProps) {
	const { t } = useTranslation();
	const [query, setQuery] = useState('');

	const handleSearch = useCallback(() => {
		const trimmed = query.trim();
		if (!trimmed) return;
		onSearch(trimmed);
	}, [query, onSearch]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Enter') handleSearch();
		},
		[handleSearch]
	);

	return (
		<div className="search-panel">
			<div className="controls">
				<ProductSelector value={currentProduct} onChange={onSwitchProduct} />
				<input
					type="text"
					className="search-input"
					placeholder={t('playground.queryPlaceholder')}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
				/>
				<button className="btn-primary" onClick={handleSearch} disabled={isSearching}>
					{isSearching ? t('playground.searching') : t('playground.search')}
				</button>
			</div>

			<div className="tools-section">
				<div className="tools-header">
					<div className="section-label">{t('playground.availableTools')}</div>
					<button className="btn-text" onClick={onListTools} disabled={isLoadingTools}>
						{isLoadingTools ? t('playground.loading') : t('playground.listTools')}
					</button>
				</div>
				{tools.length > 0 && (
					<div className="tools-list">
						{tools.map((tool) => (
							<ToolChip
								key={tool.name}
								name={tool.name}
								onClick={() => onShowToolInfo(tool)}
							/>
						))}
					</div>
				)}
			</div>

			<div className="panel">
				<div className="panel-header">
					<h2>{t('playground.searchResults')}</h2>
					<span className="panel-badge">{searchResults.length}</span>
				</div>
				<div className="panel-body">
					{error && <div className="status-error">{error}</div>}
					{isSearching && <div className="status-loading">{t('playground.searching')}</div>}
					{!isSearching && searchResults.length === 0 && !error && (
						<div className="status-empty">{t('playground.waitingQuery')}</div>
					)}
					{searchResults.map((result, i) => (
						<SearchResultCard
							key={i}
							result={result}
							rank={i + 1}
							onViewContent={() => onViewContent(i)}
							onFetchDoc={result.doc_id ? () => onFetchDoc(result.doc_id!) : undefined}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
