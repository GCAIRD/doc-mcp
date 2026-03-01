import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/CodeBlock';
import UrlBlock from '../../components/UrlBlock';
import { getClientConfig } from '../../lib/config';
import { useActiveProducts } from '../../hooks/useActiveProducts';

export default function OtherContent() {
	const { t } = useTranslation();
	const products = useActiveProducts();

	return (
		<div className="content-panel">
			<h2>{t('other.title')}</h2>
			<p className="intro-text">{t('other.intro')}</p>

			{products.map((p, i) => (
				<div key={p.id} style={i > 0 ? { marginTop: '2rem' } : undefined}>
					<h3 className="section-title">{p.name}</h3>
					<UrlBlock url={p.endpoint} label="Streamable HTTP Endpoint" />
					<CodeBlock code={getClientConfig('other', { endpoint: p.endpoint, serverName: `${p.id}-mcp` })} label={p.name} />
				</div>
			))}

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('other.configTitle')}</h3>
			<ul className="config-locations">
				{(t('other.configLocations', { returnObjects: true }) as string[]).map((loc, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: loc }} />
				))}
			</ul>

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('other.stepsTitle')}</h3>
			<ol className="steps">
				{(t('other.steps', { returnObjects: true }) as string[]).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('other.troubleTitle')}</h3>
			<ul className="trouble-list">
				{(t('other.troubleItems', { returnObjects: true }) as string[]).map((item, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: item }} />
				))}
			</ul>
		</div>
	);
}
