import { useState, useCallback } from 'react';

async function copyToClipboard(text: string): Promise<void> {
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
}

export function useClipboard(resetDelay = 2000) {
	const [copied, setCopied] = useState(false);

	const copy = useCallback(async (text: string) => {
		await copyToClipboard(text);
		setCopied(true);
		setTimeout(() => setCopied(false), resetDelay);
	}, [resetDelay]);

	return { copied, copy };
}
