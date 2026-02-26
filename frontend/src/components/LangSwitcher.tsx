import { useTranslation } from 'react-i18next';

const LANGUAGES = [
	{ code: 'zh', label: '中文' },
	{ code: 'en', label: 'EN' },
	{ code: 'ja', label: '日本語' },
] as const;

export default function LangSwitcher() {
	const { i18n } = useTranslation();

	return (
		<div className="lang-switcher">
			{LANGUAGES.map((lang) => (
				<button
					key={lang.code}
					className={`lang-btn ${i18n.language === lang.code ? 'active' : ''}`}
					onClick={() => i18n.changeLanguage(lang.code)}
				>
					{lang.label}
				</button>
			))}
		</div>
	);
}
