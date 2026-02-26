import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from 'react-i18next';

const THEMES = ['light', 'dark', 'system'] as const;
const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export default function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const { t } = useTranslation();

	const cycleTheme = () => {
		const idx = THEMES.indexOf(theme);
		setTheme(THEMES[(idx + 1) % THEMES.length]);
	};

	const Icon = ICONS[theme];

	return (
		<button
			className="theme-toggle"
			onClick={cycleTheme}
			title={t(`theme.${theme}`)}
			aria-label={t(`theme.${theme}`)}
		>
			<Icon size={18} />
		</button>
	);
}
