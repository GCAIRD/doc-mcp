import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/CodeBlock';
import { getClientConfig } from '../../lib/config';
import { useActiveProducts } from '../../hooks/useActiveProducts';

export default function CopilotContent() {
	const { t } = useTranslation();
	const products = useActiveProducts();

	return (
		<div className="content-panel">
			<h2>{t('copilot.title')}</h2>
			<ol className="steps">
				{(t('copilot.steps', { returnObjects: true }) as string[]).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			<div className="note" dangerouslySetInnerHTML={{ __html: t('copilot.note') }} />

			<h3 className="section-title">{t('copilot.addTitle')}</h3>
			<p className="section-desc" dangerouslySetInnerHTML={{ __html: t('copilot.addDesc') }} />
			{products.map((p) => (
				<CodeBlock key={p.id} code={getClientConfig('copilot', { endpoint: p.endpoint, serverName: `${p.id}-mcp` })} label={`.vscode/mcp.json (${p.name})`} />
			))}

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('copilot.altTitle')}</h3>
			<ol className="steps">
				{(t('copilot.altSteps', { returnObjects: true }) as string[]).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('copilot.usageTitle')}</h3>
			<ol className="steps">
				{(t('copilot.usageSteps', { returnObjects: true }) as string[]).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			<div className="note" dangerouslySetInnerHTML={{ __html: t('copilot.manageTip') }} />
		</div>
	);
}
