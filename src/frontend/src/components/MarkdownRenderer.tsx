import { useEffect, useRef } from 'react';
import hljs from 'highlight.js';
import { renderMarkdownToHtml } from '../lib/markdown';

interface MarkdownRendererProps {
	content: string;
	className?: string;
}

export default function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) return;
		containerRef.current.querySelectorAll<HTMLElement>('pre code').forEach((block) => {
			hljs.highlightElement(block);
		});
	}, [content]);

	return (
		<div
			ref={containerRef}
			className={`markdown-body ${className ?? ''}`}
			dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(content) }}
		/>
	);
}
