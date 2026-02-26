import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/CodeBlock';
import { getClientConfig, PRODUCTS, type ProductId } from '../../lib/config';

interface ClientContentProps {
	client: string;
}

/**
 * Generic client setup content used for:
 * cursor, windsurf, cline, trae, jetbrains, lobechat
 */
export default function ClientContent({ client }: ClientContentProps) {
	const { t } = useTranslation();

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
			{PRODUCTS.map((p: ProductId) => (
				<CodeBlock key={p} code={getClientConfig(client, p)} label={t(`products.${p}`)} />
			))}
		</div>
	);
}
