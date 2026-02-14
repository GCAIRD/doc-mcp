import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../node_modules/react-i18next';
import { Copy, Check, Table2, FileSpreadsheet, ChevronDown, Play, Puzzle, BarChart3 } from 'lucide-react';
import './i18n';
import './App.css';

// Clipboard copy function (compatible with non-HTTPS)
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

// MCP server URL config — auto-detect from current page origin
const MCP_BASE_URL = `${window.location.origin}/mcp`;
const MCP_URLS = {
	spreadjs: `${MCP_BASE_URL}/spreadjs`,
	gcexcel: `${MCP_BASE_URL}/gcexcel`,
	forguncy: `${MCP_BASE_URL}/forguncy`,
	wyn: `${MCP_BASE_URL}/wyn`,
};

// Client categories
const clientCategories = [
	{
		id: 'ide',
		clients: ['copilot', 'cursor', 'windsurf', 'cline', 'trae', 'jetbrains']
	},
	{
		id: 'chat',
		clients: ['cherrystudio', 'lobechat']
	},
	{
		id: 'general',
		clients: ['other']
	}
];

const getConfig = (client, product = 'spreadjs') => {
	const url = MCP_URLS[product] || MCP_URLS.spreadjs;
	const serverName = `${product}-mcp`;

	// VSCode (copilot) uses servers field
	if (client === 'copilot') {
		return {
			servers: {
				[serverName]: { type: 'http', url }
			}
		};
	}

	// Windsurf uses serverUrl instead of url
	if (client === 'windsurf') {
		return {
			mcpServers: {
				[serverName]: { serverUrl: url }
			}
		};
	}

	// Trae uses array format
	if (client === 'trae') {
		return {
			mcpServers: [
				{ name: serverName, url, type: 'sse' }
			]
		};
	}

	// Cherry Studio uses streamableHttp type
	if (client === 'cherrystudio') {
		return {
			mcpServers: {
				[serverName]: { type: 'streamableHttp', url }
			}
		};
	}

	// LobeChat uses standard format
	if (client === 'lobechat') {
		return {
			mcpServers: {
				[serverName]: { type: 'http', url }
			}
		};
	}

	// Cursor, Cline, JetBrains, Other use standard format
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
									{'\n'}{spaces}  <span className="string">"{v}"</span>{itemComma}
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

	const products = ['spreadjs', 'gcexcel', 'forguncy', 'wyn'];

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
			{products.map(p => (
				<CodeBlock key={p} code={getConfig('copilot', p)} label={`.vscode/mcp.json (${t(`products.${p}`)})`} />
			))}

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

	const products = ['spreadjs', 'gcexcel', 'forguncy', 'wyn'];

	return (
		<div className="content-panel">
			<h2>{t('other.title')}</h2>
			<p className="intro-text">{t('other.intro')}</p>

			{products.map((p, i) => (
				<div key={p} style={i > 0 ? { marginTop: '2rem' } : undefined}>
					<h3 className="section-title">{t(`other.${p}Title`)}</h3>
					<p className="section-desc">{t(`other.${p}Desc`)}</p>
					<UrlBlock url={MCP_URLS[p]} label="Streamable HTTP Endpoint" />
					<CodeBlock code={getConfig('other', p)} label={t(`products.${p}`)} />
				</div>
			))}

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

function CherryStudioContent() {
	const { t } = useTranslation();

	const products = ['spreadjs', 'gcexcel', 'forguncy', 'wyn'];

	return (
		<div className="content-panel">
			<h2>{t('cherrystudio.title')}</h2>
			<ol className="steps">
				{t('cherrystudio.steps', { returnObjects: true }).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			<div className="note" dangerouslySetInnerHTML={{ __html: t('cherrystudio.note') }} />

			<h3 className="section-title">{t('cherrystudio.addTitle')}</h3>
			<p className="section-desc" dangerouslySetInnerHTML={{ __html: t('cherrystudio.addDesc') }} />
			<ol className="steps">
				{t('cherrystudio.configSteps', { returnObjects: true }).map((step, i) => (
					<li key={i} dangerouslySetInnerHTML={{ __html: step }} />
				))}
			</ol>
			{products.map(p => (
				<UrlBlock key={p} url={MCP_URLS[p]} label={`${t(`products.${p}`)} URL`} />
			))}

			<h3 className="section-title" style={{ marginTop: '2rem' }}>JSON Config Reference</h3>
			{products.map(p => (
				<CodeBlock key={p} code={getConfig('cherrystudio', p)} label={t(`products.${p}`)} />
			))}
		</div>
	);
}

function ClientContent({ client }) {
	const { t } = useTranslation();

	if (client === 'copilot') {
		return <CopilotContent />;
	}

	if (client === 'cherrystudio') {
		return <CherryStudioContent />;
	}

	if (client === 'other') {
		return <OtherContent />;
	}

	const products = ['spreadjs', 'gcexcel', 'forguncy', 'wyn'];

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
			{products.map(p => (
				<CodeBlock key={p} code={getConfig(client, p)} label={t(`products.${p}`)} />
			))}
		</div>
	);
}

function App() {
	const { t, i18n } = useTranslation();
	const [activeClient, setActiveClient] = useState('copilot');
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const dropdownRef = useRef(null);

	const languages = [
		{ code: 'zh', label: '中文' },
		{ code: 'en', label: 'EN' },
		{ code: 'ja', label: '日本語' }
	];

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const handleClientSelect = (clientId) => {
		setActiveClient(clientId);
		setDropdownOpen(false);
	};

	return (
		<div className="app">
			<header className="header">
				<div className="logo">
					<div className="logo-icon">GC</div>
					<span className="logo-text">{t('title')}</span>
				</div>
				<div className="header-actions">
					<a href="/playground" className="try-now-header" title={t('tryNow.description')}>
						<Play size={16} />
						<span>{t('tryNow.button')}</span>
					</a>
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
				</div>
			</header>

			<main className="main">
				<div className="hero">
					<h1>{t('title')}</h1>
					<p className="subtitle">{t('subtitle')}</p>
					<p className="description">{t('description')}</p>
				</div>

				<div className="client-selector" ref={dropdownRef}>
					<div className="dropdown" onClick={() => setDropdownOpen(!dropdownOpen)}>
						<span className="dropdown-label">{t(`clients.${activeClient}`)}</span>
						<ChevronDown size={20} className={`dropdown-icon ${dropdownOpen ? 'open' : ''}`} />
					</div>
					{dropdownOpen && (
						<div className="dropdown-menu">
							{clientCategories.map(category => (
								<div key={category.id} className="dropdown-group">
									<div className="dropdown-group-label">{t(`categories.${category.id}`)}</div>
									{category.clients.map(clientId => (
										<div
											key={clientId}
											className={`dropdown-item ${activeClient === clientId ? 'active' : ''}`}
											onClick={() => handleClientSelect(clientId)}
										>
											{t(`clients.${clientId}`)}
										</div>
									))}
								</div>
							))}
						</div>
					)}
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
						<div className="product-item">
							<Puzzle className="product-icon" />
							<span>{t('products.forguncy')}</span>
						</div>
						<div className="product-item">
							<BarChart3 className="product-icon" />
							<span>{t('products.wyn')}</span>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}

export default App;
