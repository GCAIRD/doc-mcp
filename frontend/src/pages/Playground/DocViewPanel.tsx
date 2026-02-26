import { useTranslation } from 'react-i18next';
import MarkdownRenderer from '../../components/MarkdownRenderer';

interface DocViewPanelProps {
	content: string | null;
	isFetching: boolean;
}

export default function DocViewPanel({ content, isFetching }: DocViewPanelProps) {
	const { t } = useTranslation();

	return (
		<div className="panel">
			<div className="panel-header">
				<h2>{t('playground.docDetails')}</h2>
			</div>
			<div className="panel-body doc-view">
				{isFetching && (
					<div className="status-loading">{t('playground.loadingDoc')}</div>
				)}
				{!isFetching && !content && (
					<div className="status-empty">{t('playground.selectResult')}</div>
				)}
				{!isFetching && content && (
					<MarkdownRenderer content={content} />
				)}
			</div>
		</div>
	);
}
