import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/CodeBlock';
import UrlBlock from '../../components/UrlBlock';
import { getClientConfig, PRODUCTS, MCP_URLS, type ProductId } from '../../lib/config';

export default function OtherContent() {
	const { t } = useTranslation();

	return (
		<div className="content-panel">
			<h2>{t('other.title')}</h2>
			<p className="intro-text">{t('other.intro')}</p>

			{PRODUCTS.map((p: ProductId, i: number) => (
				<div key={p} style={i > 0 ? { marginTop: '2rem' } : undefined}>
					<h3 className="section-title">{t(`other.${p}Title`)}</h3>
					<p className="section-desc">{t(`other.${p}Desc`)}</p>
					<UrlBlock url={MCP_URLS[p]} label="Streamable HTTP Endpoint" />
					<CodeBlock code={getClientConfig('other', p)} label={t(`products.${p}`)} />
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
