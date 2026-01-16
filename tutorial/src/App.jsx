import { useState } from 'react';
import { useTranslation } from '../node_modules/react-i18next';
import { Copy, Check, Table2, FileSpreadsheet, MousePointer2, Terminal, MoreHorizontal, Github } from 'lucide-react';
import './i18n';
import './App.css';

// 兼容非 HTTPS 环境的复制函数
const copyToClipboard = async (text) => {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(text);
	} else {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand('copy');
		document.body.removeChild(textarea);
	}
};

// MCP 服务器地址配置
const MCP_BASE_URL = 'http://20.2.219.14:8889/mcp';
const MCP_URLS = {
	spreadjs: `${MCP_BASE_URL}/spreadjs`,
	gcexcel: `${MCP_BASE_URL}/gcexcel`
};

const clients = [
	{ id: 'copilot', icon: Github },
	{ id: 'cursor', icon: MousePointer2 },
	{ id: 'windsurf', icon: Terminal },
	{ id: 'cline', icon: Terminal },
	{ id: 'trae', icon: Terminal },
	{ id: 'jetbrains', icon: Terminal },
	{ id: 'other', icon: MoreHorizontal }
];

const getConfig = (client, product = 'spreadjs') => {
	const url = MCP_URLS[product] || MCP_URLS.spreadjs;
	const serverName = `GC-DOC-MCP-${product}`;

	// VSCode (copilot) 使用 servers 字段
	if (client === 'copilot') {
		return {
			servers: {
				[serverName]: { type: 'http', url }
			}
		};
	}

	// Windsurf 使用 serverUrl 而非 url
	if (client === 'windsurf') {
		return {
			mcpServers: {
				[serverName]: { serverUrl: url }
			}
		};
	}

	// Trae 使用数组格式
	if (client === 'trae') {
		return {
			mcpServers: [
				{ name: serverName, url, type: 'sse' }
			]
		};
	}

	// Cursor, Cline, JetBrains, Other 使用标准格式
	return {
		mcpServers: {
			[serverName]: { type: 'http', url }
		}
	};
};

function CodeBlock({ code, lang = 'json', label }) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await copyToClipboard(JSON.stringify(code, null, 2));
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	const formatJson = (obj, indent = 0) => {
		const spaces = '  '.repeat(indent);
		const entries = Object.entries(obj);

		return entries.map(([key, value], i) => {
			const comma = i < entries.length - 1 ? ',' : '';
			if (Array.isArray(value)) {
				return (
					<span key={key}>
						{spaces}<span className="key">"{key}"</span>: [
						{value.map((v, vi) => (
							<span key={vi}>
								{'\n'}{spaces}  <span className="string">"{v}"</span>{vi < value.length - 1 ? ',' : ''}
							</span>
						))}
						{'\n'}{spaces}]{comma}{'\n'}
					</span>
				);
			}
			if (typeof value === 'object' && value !== null) {
				return (
					<span key={key}>
						{spaces}<span className="key">"{key}"</span>: {'{\n'}
						{formatJson(value, indent + 1)}
						{spaces}{'}'}{comma}{'\n'}
					</span>
				);
			}
			if (typeof value === 'boolean') {
				return (
					<span key={key}>
						{spaces}<span className="key">"{key}"</span>: <span className="boolean">{value.toString()}</span>{comma}{'\n'}
					</span>
				);
			}
			return (
				<span key={key}>
					{spaces}<span className="key">"{key}"</span>: <span className="string">"{value}"</span>{comma}{'\n'}
				</span>
			);
		});
	};

	return (
		<div className="code-block">
			<div className="code-header">
				<span className="code-lang">{label || lang}</span>
				<button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
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

function UrlBlock({ url, label }) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await copyToClipboard(url);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="code-block">
			<div className="code-header">
				<span className="code-lang">{label}</span>
				<button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
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

function CopilotContent() {
	const { t } = useTranslation();
	const spreadjsConfig = getConfig('copilot', 'spreadjs');
	const gcexcelConfig = getConfig('copilot', 'gcexcel');

	return (
		<div className="content-panel">
			<h2>{t('copilot.title')}</h2>
			<ol className="steps">
				{t('copilot.steps', { returnObjects: true }).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			<div className="note" dangerouslySetInnerHTML={{ __html: t('copilot.note') }} />

			<h3 className="section-title">{t('copilot.addTitle')}</h3>
			<p className="section-desc" dangerouslySetInnerHTML={{ __html: t('copilot.addDesc') }} />
			<CodeBlock code={spreadjsConfig} label=".vscode/mcp.json (SpreadJS)" />
			<CodeBlock code={gcexcelConfig} label=".vscode/mcp.json (GcExcel)" />

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('copilot.altTitle')}</h3>
			<ol className="steps">
				{t('copilot.altSteps', { returnObjects: true }).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('copilot.usageTitle')}</h3>
			<ol className="steps">
				{t('copilot.usageSteps', { returnObjects: true }).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			<div className="note" dangerouslySetInnerHTML={{ __html: t('copilot.manageTip') }} />
		</div>
	);
}

function OtherContent() {
	const { t } = useTranslation();
	const spreadjsConfig = getConfig('other', 'spreadjs');
	const gcexcelConfig = getConfig('other', 'gcexcel');

	return (
		<div className="content-panel">
			<h2>{t('other.title')}</h2>
			<p className="intro-text">{t('other.intro')}</p>

			<h3 className="section-title">{t('other.spreadjsTitle')}</h3>
			<p className="section-desc">{t('other.spreadjsDesc')}</p>
			<UrlBlock url={MCP_URLS.spreadjs} label="Streamable HTTP Endpoint" />
			<CodeBlock code={spreadjsConfig} label="SpreadJS Configuration" />

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('other.gcexcelTitle')}</h3>
			<p className="section-desc">{t('other.gcexcelDesc')}</p>
			<UrlBlock url={MCP_URLS.gcexcel} label="Streamable HTTP Endpoint" />
			<CodeBlock code={gcexcelConfig} label="GcExcel Configuration" />

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('other.configTitle')}</h3>
			<ul className="config-locations">
				{t('other.configLocations', { returnObjects: true }).map((loc, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: loc }} />
				))}
			</ul>

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('other.stepsTitle')}</h3>
			<ol className="steps">
				{t('other.steps', { returnObjects: true }).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>

			<h3 className="section-title" style={{ marginTop: '2rem' }}>{t('other.troubleTitle')}</h3>
			<ul className="trouble-list">
				{t('other.troubleItems', { returnObjects: true }).map((item, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: item }} />
				))}
			</ul>
		</div>
	);
}

function ClientContent({ client }) {
	const { t } = useTranslation();

	if (client === 'copilot') {
		return <CopilotContent />;
	}

	if (client === 'other') {
		return <OtherContent />;
	}

	const spreadjsConfig = getConfig(client, 'spreadjs');
	const gcexcelConfig = getConfig(client, 'gcexcel');

	return (
		<div className="content-panel" key={client}>
			<h2>{t(`${client}.title`)}</h2>
			<ol className="steps">
				{t(`${client}.steps`, { returnObjects: true }).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			<div className="note" dangerouslySetInnerHTML={{ __html: t(`${client}.note`) }} />
			<h3 className="section-title">{t(`${client}.addTitle`)}</h3>
			<p className="section-desc" dangerouslySetInnerHTML={{ __html: t(`${client}.addDesc`) }} />
			<CodeBlock code={spreadjsConfig} label="SpreadJS" />
			<CodeBlock code={gcexcelConfig} label="GcExcel" />
		</div>
	);
}

function App() {
	const { t, i18n } = useTranslation();
	const [activeClient, setActiveClient] = useState('copilot');

	const languages = [
		{ code: 'zh', label: '中文' },
		{ code: 'en', label: 'EN' },
		{ code: 'ja', label: '日本語' }
	];

	return (
		<div className="app">
			<header className="header">
				<div className="logo">
					<div className="logo-icon">GC</div>
					<span className="logo-text">{t('title')}</span>
				</div>
				<div className="lang-switcher">
					{languages.map(lang => (
						<button
							key={lang.code}
							className={`lang-btn ${i18n.language === lang.code ? 'active' : ''}`}
							onClick={() => i18n.changeLanguage(lang.code)}
						>
							{lang.label}
						</button>
					))}
				</div>
			</header>

			<main className="main">
				<div className="hero">
					<h1>{t('title')}</h1>
					<p className="subtitle">{t('subtitle')}</p>
					<p className="description">{t('description')}</p>
				</div>

				<div className="tabs">
					{clients.map(({ id, icon: Icon }) => (
						<button
							key={id}
							className={`tab ${activeClient === id ? 'active' : ''}`}
							onClick={() => setActiveClient(id)}
						>
							<Icon size={20} className="tab-icon" />
							<span>{t(`clients.${id}`)}</span>
						</button>
					))}
				</div>

				<ClientContent client={activeClient} />

				<div className="products">
					<h3>{t('products.title')}</h3>
					<div className="product-list">
						<div className="product-item">
							<Table2 className="product-icon" />
							<span>{t('products.spreadjs')}</span>
						</div>
						<div className="product-item">
							<FileSpreadsheet className="product-icon" />
							<span>{t('products.gcexcel')}</span>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}

export default App;
