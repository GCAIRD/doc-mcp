import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVersion } from '../hooks/useHealth';
import ThemeToggle from './ThemeToggle';
import LangSwitcher from './LangSwitcher';
import './Header.css';

export default function Header() {
	const { t } = useTranslation();
	const version = useVersion();

	return (
		<header className="header">
			<div className="header-left">
				<NavLink to="/" className="logo">
					<div className="logo-icon">MCS</div>
					<span className="logo-text">{t('title')}</span>
					{version && <span className="version-badge">v{version}</span>}
				</NavLink>
				<nav className="nav-links">
					<NavLink to="/" end className="nav-link">
						{t('nav.setup')}
					</NavLink>
					<NavLink to="/playground" className="nav-link">
						{t('nav.playground')}
					</NavLink>
				</nav>
			</div>
			<div className="header-actions">
				<ThemeToggle />
				<LangSwitcher />
			</div>
		</header>
	);
}
