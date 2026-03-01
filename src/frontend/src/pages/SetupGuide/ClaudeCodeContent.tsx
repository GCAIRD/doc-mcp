import { useTranslation } from 'react-i18next';
import { Copy, Check } from 'lucide-react';
import { useClipboard } from '../../hooks/useClipboard';
import { useActiveProducts } from '../../hooks/useActiveProducts';

function CommandBlock({ command, label }: { command: string; label?: string }) {
	const { t } = useTranslation();
	const { copied, copy } = useClipboard();

	return (
		<div className="code-block">
			<div className="code-header">
				<span className="code-lang">{label || 'bash'}</span>
				<button
					className={`copy-btn ${copied ? 'copied' : ''}`}
					onClick={() => copy(command)}
				>
					{copied ? <Check size={14} /> : <Copy size={14} />}
					{copied ? t('copied') : t('copy')}
				</button>
			</div>
			<div className="code-content">
				<pre>{command}</pre>
			</div>
		</div>
	);
}

export default function ClaudeCodeContent() {
	const { t } = useTranslation();
	const products = useActiveProducts();

	return (
		<div className="content-panel">
			<h2>{t('claudecode.title')}</h2>
			<ol className="steps">
				{(t('claudecode.steps', { returnObjects: true }) as string[]).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			<div className="note" dangerouslySetInnerHTML={{ __html: t('claudecode.note') }} />

			<h3 className="section-title">{t('claudecode.addTitle')}</h3>
			<p className="section-desc" dangerouslySetInnerHTML={{ __html: t('claudecode.addDesc') }} />
			{products.map((p) => (
				<CommandBlock
					key={p.id}
					command={`claude mcp add ${p.id}-docs --transport http ${p.endpoint}`}
					label={p.name}
				/>
			))}
			<p className="section-desc" style={{ marginTop: '0.75rem' }} dangerouslySetInnerHTML={{ __html: t('claudecode.scopeNote') }} />

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('claudecode.verifyTitle')}</h3>
			<p className="section-desc" dangerouslySetInnerHTML={{ __html: t('claudecode.verifyDesc') }} />
			{(t('claudecode.verifyCommands', { returnObjects: true }) as string[]).map((cmd) => (
				<CommandBlock key={cmd} command={cmd} label="bash" />
			))}
		</div>
	);
}
