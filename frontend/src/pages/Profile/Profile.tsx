import { useTranslation } from 'react-i18next';

export default function Profile() {
	const { t } = useTranslation();

	return (
		<div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
			<h1 style={{ fontFamily: 'var(--font-display)', marginBottom: '1rem' }}>
				{t('title')}
			</h1>
			<p style={{ color: 'var(--text-secondary)' }}>Profile page coming soon.</p>
		</div>
	);
}
