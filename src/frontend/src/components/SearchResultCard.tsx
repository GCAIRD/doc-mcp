import { useTranslation } from 'react-i18next';
import type { McpSearchResult } from '../types/mcp';

interface SearchResultCardProps {
	result: McpSearchResult;
	rank: number;
	onViewContent: () => void;
	onFetchDoc?: () => void;
}

function formatDocId(docId: string): string {
	return docId
		.replace(/_/g, ' / ')
		.replace(/chunk\d+/gi, '')
		.replace(/\s*\/\s*$/, '');
}

function getScore(result: McpSearchResult): number | null {
	const raw = result.score ?? result.similarity ?? result.relevance;
	if (raw == null) return null;
	return raw <= 1 ? raw * 100 : raw;
}

function getTitle(result: McpSearchResult): string {
	return result.doc_id
		? formatDocId(result.doc_id)
		: result.title ?? result.name ?? result.id ?? 'Untitled';
}

function getPreview(result: McpSearchResult): string {
	const raw = result.content_preview ?? result.content ?? result.text ?? result.snippet ?? '';
	return raw
		.replace(/[#*`_~]/g, '')
		.replace(/\n+/g, ' ')
		.slice(0, 200);
}

export default function SearchResultCard({
	result,
	rank,
	onViewContent,
	onFetchDoc,
}: SearchResultCardProps) {
	const { t } = useTranslation();
	const score = getScore(result);
	const title = getTitle(result);
	const preview = getPreview(result);

	return (
		<div className="result-item">
			<div className="result-header">
				<span className="result-rank">{rank}</span>
				<span className="result-title">{title}</span>
				{score !== null && (
					<span className="result-score">{score.toFixed(1)}%</span>
				)}
			</div>
			{result.metadata && (
				<div className="result-meta">
					{result.metadata.category && (
						<span className="meta-tag">{result.metadata.category}</span>
					)}
					{result.metadata.file_name && (
						<span className="meta-tag">{result.metadata.file_name}</span>
					)}
					{result.metadata.path_hierarchy?.map((p, i) => (
						<span key={i} className="meta-tag">{p}</span>
					))}
				</div>
			)}
			{preview && <p className="result-preview">{preview}</p>}
			<div className="result-actions">
				<button className="btn-secondary" onClick={onViewContent}>
					{t('playground.viewContent')}
				</button>
				{result.doc_id && onFetchDoc && (
					<button className="btn-primary" onClick={onFetchDoc}>
						{t('playground.fetchDoc')}
					</button>
				)}
			</div>
		</div>
	);
}
