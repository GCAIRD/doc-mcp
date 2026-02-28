import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useClipboard } from '../hooks/useClipboard';

interface UrlBlockProps {
	url: string;
	label?: string;
}

export default function UrlBlock({ url, label }: UrlBlockProps) {
	const { t } = useTranslation();
	const { copied, copy } = useClipboard();

	return (
		<div className="code-block">
			<div className="code-header">
				<span className="code-lang">{label}</span>
				<button
					className={`copy-btn ${copied ? 'copied' : ''}`}
					onClick={() => copy(url)}
				>
					{copied ? <Check size={14} /> : <Copy size={14} />}
					{copied ? t('copied') : t('copy')}
				</button>
			</div>
			<div className="code-content">
				<pre className="url-text">{url}</pre>
			</div>
		</div>
	);
}
