import type { ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useClipboard } from '../hooks/useClipboard';

interface CodeBlockProps {
	code: Record<string, unknown>;
	lang?: string;
	label?: string;
}

function formatJson(obj: unknown, indent = 0): ReactNode[] {
	if (typeof obj !== 'object' || obj === null) return [];
	const spaces = '  '.repeat(indent);
	const entries = Array.isArray(obj)
		? obj.map((v, i) => [String(i), v] as const)
		: Object.entries(obj);

	return entries.map(([key, value], i) => {
		const comma = i < entries.length - 1 ? ',' : '';
		const isArray = Array.isArray(obj);

		if (Array.isArray(value)) {
			return (
				<span key={key}>
					{spaces}{!isArray && <><span className="key">"{key}"</span>: </>}[
					{value.map((v, vi) => {
						const itemComma = vi < value.length - 1 ? ',' : '';
						if (typeof v === 'object' && v !== null) {
							return (
								<span key={vi}>
									{'\n'}{spaces}  {'{\n'}
									{formatJson(v, indent + 2)}
									{spaces}  {'}'}{itemComma}
								</span>
							);
						}
						return (
							<span key={vi}>
								{'\n'}{spaces}  <span className="string">"{String(v)}"</span>{itemComma}
							</span>
						);
					})}
					{'\n'}{spaces}]{comma}{'\n'}
				</span>
			);
		}
		if (typeof value === 'object' && value !== null) {
			return (
				<span key={key}>
					{spaces}{!isArray && <><span className="key">"{key}"</span>: </>}{'{\n'}
					{formatJson(value, indent + 1)}
					{spaces}{'}'}{comma}{'\n'}
				</span>
			);
		}
		if (typeof value === 'boolean') {
			return (
				<span key={key}>
					{spaces}{!isArray && <><span className="key">"{key}"</span>: </>}
					<span className="boolean">{value.toString()}</span>{comma}{'\n'}
				</span>
			);
		}
		return (
			<span key={key}>
				{spaces}{!isArray && <><span className="key">"{key}"</span>: </>}
				<span className="string">"{String(value)}"</span>{comma}{'\n'}
			</span>
		);
	});
}

export default function CodeBlock({ code, lang = 'json', label }: CodeBlockProps) {
	const { t } = useTranslation();
	const { copied, copy } = useClipboard();

	return (
		<div className="code-block">
			<div className="code-header">
				<span className="code-lang">{label || lang}</span>
				<button
					className={`copy-btn ${copied ? 'copied' : ''}`}
					onClick={() => copy(JSON.stringify(code, null, 2))}
				>
					{copied ? <Check size={14} /> : <Copy size={14} />}
					{copied ? t('copied') : t('copy')}
				</button>
			</div>
			<div className="code-content">
				<pre>
					{'{\n'}
					{formatJson(code, 1)}
					{'}'}
				</pre>
			</div>
		</div>
	);
}
