import { useHealth } from '../hooks/useHealth';
import './StatusBar.css';

export default function StatusBar() {
	const { status, version, error } = useHealth();

	return (
		<footer className="app-footer">
			<span className="footer-copyright">&copy; {new Date().getFullYear()} MESCIUS</span>
			<span className={`status-pill ${status}`}>
				<span className="status-dot" />
				{status === 'loading' && 'Connecting...'}
				{status === 'connected' && (version ? `Connected · v${version}` : 'Connected')}
				{status === 'error' && `Unreachable — ${error}`}
			</span>
		</footer>
	);
}
