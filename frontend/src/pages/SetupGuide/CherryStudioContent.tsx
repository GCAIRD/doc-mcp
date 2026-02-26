import { useTranslation } from 'react-i18next';
import CodeBlock from '../../components/CodeBlock';
import UrlBlock from '../../components/UrlBlock';
import { getClientConfig, PRODUCTS, MCP_URLS, type ProductId } from '../../lib/config';

export default function CherryStudioContent() {
	const { t } = useTranslation();

	return (
		<div className="content-panel">
			<h2>{t('cherrystudio.title')}</h2>
			<ol className="steps">
				{(t('cherrystudio.steps', { returnObjects: true }) as string[]).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			<div className="note" dangerouslySetInnerHTML={{ __html: t('cherrystudio.note') }} />

			<h3 className="section-title">{t('cherrystudio.addTitle')}</h3>
			<p className="section-desc" dangerouslySetInnerHTML={{ __html: t('cherrystudio.addDesc') }} />
			<ol className="steps">
				{(t('cherrystudio.configSteps', { returnObjects: true }) as string[]).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			{PRODUCTS.map((p: ProductId) => (
				<UrlBlock key={p} url={MCP_URLS[p]} label={`${t(`products.${p}`)} URL`} />
			))}

			<h3 className="section-title" style={{ marginTop: '2rem' }}>JSON Config Reference</h3>
			{PRODUCTS.map((p: ProductId) => (
				<CodeBlock key={p} code={getClientConfig('cherrystudio', p)} label={t(`products.${p}`)} />
			))}
		</div>
	);
}
