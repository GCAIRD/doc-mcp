import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { LogEntry } from '../types/mcp';

interface RequestLogProps {
	entries: LogEntry[];
}

export default function RequestLog({ entries }: RequestLogProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const logRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (open && logRef.current) {
			logRef.current.scrollTop = logRef.current.scrollHeight;
		}
	}, [entries, open]);

	return (
		<div className="log-section">
			<button className="log-toggle" onClick={() => setOpen(!open)}>
				<span className={`arrow ${open ? 'open' : ''}`}>&#9654;</span>
				{t('playground.requestLog')}
				{entries.length > 0 && (
					<span className="log-count">{entries.length}</span>
				)}
			</button>
			<div className={`log-container ${open ? 'open' : ''}`}>
				<div className="log" ref={logRef}>
					{entries.map((entry) => (
						<div key={entry.id} className={`log-entry log-${entry.type}`}>
							<span className="log-time">
								{entry.timestamp.toLocaleTimeString()}
							</span>
							{entry.message}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
