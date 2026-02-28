import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

marked.use(markedHighlight({
	langPrefix: 'hljs language-',
	highlight(code: string, lang: string) {
		const language = hljs.getLanguage(lang) ? lang : 'plaintext';
		return hljs.highlight(code, { language }).value;
	},
}));

marked.setOptions({ breaks: true, gfm: true });

export function renderMarkdownToHtml(content: string): string {
	return marked.parse(content) as string;
}
