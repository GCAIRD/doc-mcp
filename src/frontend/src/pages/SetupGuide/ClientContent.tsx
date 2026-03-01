import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/CodeBlock';
import { getClientConfig } from '../../lib/config';
import { useActiveProducts } from '../../hooks/useActiveProducts';

interface ClientContentProps {
	client: string;
}

/**
 * Generic client setup content used for:
 * cursor, windsurf, cline, claudedesktop, codex, jetbrains, lobechat, cherrystudio
 */
export default function ClientContent({ client }: ClientContentProps) {
	const { t } = useTranslation();
	const products = useActiveProducts();

	return (
		<div className="content-panel">
			<h2>{t(`${client}.title`)}</h2>
			<ol className="steps">
				{(t(`${client}.steps`, { returnObjects: true }) as string[]).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			<div className="note" dangerouslySetInnerHTML={{ __html: t(`${client}.note`) }} />
			<h3 className="section-title">{t(`${client}.addTitle`)}</h3>
			<p className="section-desc" dangerouslySetInnerHTML={{ __html: t(`${client}.addDesc`) }} />
			{products.map((p) => (
				<CodeBlock key={p.id} code={getClientConfig(client, { endpoint: p.endpoint, serverName: `${p.id}-mcp` })} label={p.name} />
			))}
		</div>
	);
}
