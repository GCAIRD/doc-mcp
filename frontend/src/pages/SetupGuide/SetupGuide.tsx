import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Table2, FileSpreadsheet, Puzzle, BarChart3 } from 'lucide-react';
import { CLIENT_CATEGORIES } from '../../lib/config';
import CopilotContent from './CopilotContent';
import CherryStudioContent from './CherryStudioContent';
import OtherContent from './OtherContent';
import ClientContent from './ClientContent';
import './SetupGuide.css';

function SetupClientContent({ client }: { client: string }) {
	if (client === 'copilot') return <CopilotContent />;
	if (client === 'cherrystudio') return <CherryStudioContent />;
	if (client === 'other') return <OtherContent />;
	return <ClientContent client={client} />;
}

export default function SetupGuide() {
	const { t } = useTranslation();
	const [activeClient, setActiveClient] = useState('copilot');
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const handleClientSelect = (clientId: string) => {
		setActiveClient(clientId);
		setDropdownOpen(false);
	};

	return (
		<div className="setup-guide">
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
						{CLIENT_CATEGORIES.map((category) => (
							<div key={category.id} className="dropdown-group">
								<div className="dropdown-group-label">{t(`categories.${category.id}`)}</div>
								{category.clients.map((clientId) => (
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

			<SetupClientContent client={activeClient} />

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
		</div>
	);
}
