import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { McpTool } from '../types/mcp';

interface ToolInfoModalProps {
	tool: McpTool | null;
	open: boolean;
	onClose: () => void;
}

function syntaxHighlightJson(obj: unknown, indent = 0): string {
	const spaces = '  '.repeat(indent);

	if (obj === null) return `<span class="json-null">null</span>`;
	if (typeof obj === 'boolean') return `<span class="json-boolean">${obj}</span>`;
	if (typeof obj === 'number') return `<span class="json-number">${obj}</span>`;
	if (typeof obj === 'string') return `<span class="json-string">"${obj}"</span>`;

	if (Array.isArray(obj)) {
		if (obj.length === 0) return '[]';
		const items = obj.map(
			(item) => `${spaces}  ${syntaxHighlightJson(item, indent + 1)}`
		);
		return `[\n${items.join(',\n')}\n${spaces}]`;
	}

	if (typeof obj === 'object') {
		const entries = Object.entries(obj);
		if (entries.length === 0) return '{}';
		const items = entries.map(
			([key, val]) =>
				`${spaces}  <span class="json-key">"${key}"</span>: ${syntaxHighlightJson(val, indent + 1)}`
		);
		return `{\n${items.join(',\n')}\n${spaces}}`;
	}

	return String(obj);
}

export default function ToolInfoModal({ tool, open, onClose }: ToolInfoModalProps) {
	const { t } = useTranslation();

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		},
		[onClose]
	);

	useEffect(() => {
		if (open) {
			document.addEventListener('keydown', handleKeyDown);
			document.body.style.overflow = 'hidden';
		}
		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			document.body.style.overflow = '';
		};
	}, [open, handleKeyDown]);

	if (!open || !tool) return null;

	const handleOverlayClick = (e: React.MouseEvent) => {
		if (e.target === e.currentTarget) onClose();
	};

	return (
		<div className="modal-overlay open" onClick={handleOverlayClick}>
			<div className="modal">
				<div className="modal-header">
					<h3 className="modal-tool-name">{tool.name}</h3>
					<button className="modal-close" onClick={onClose}>&times;</button>
				</div>
				<div className="modal-body">
					<div className="modal-section">
						<div className="modal-label">{t('playground.description')}</div>
						<div>{tool.description || t('playground.noDesc')}</div>
					</div>
					<div className="modal-section">
						<div className="modal-label">{t('playground.paramSchema')}</div>
						<pre
							className="modal-schema"
							dangerouslySetInnerHTML={{
								__html: tool.inputSchema
									? syntaxHighlightJson(tool.inputSchema)
									: t('playground.none'),
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
