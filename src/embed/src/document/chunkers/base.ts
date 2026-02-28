/**
 * Base chunker class for GC-DOC-MCP v2
 * Provides shared splitting logic
 */

import { Document, Chunk, ChunkerOptions } from '../types.js';

/** 代码块合并容忍倍数（允许超出 chunkSize 的比例） */
const CODE_BLOCK_SIZE_TOLERANCE = 1.5;

/** 代码块超过此倍数时强制切分 */
const CODE_BLOCK_SPLIT_THRESHOLD = 3;

export abstract class BaseChunker {
	protected readonly chunkSize: number;
	protected readonly minChunkSize: number;

	constructor(options: ChunkerOptions) {
		this.chunkSize = options.chunk_size;
		this.minChunkSize = options.min_chunk_size;
	}

	/**
	 * Chunk a single document - must be implemented by subclass
	 */
	abstract chunkDocument(doc: Document): Generator<Chunk>;

	/**
	 * 创建 Chunk 对象（消除子类重复代码）
	 */
	protected createChunk(
		doc: Document,
		chunkIndex: number,
		content: string,
	): Chunk {
		return {
			id: `${doc.id}_chunk${chunkIndex}`,
			doc_id: doc.id,
			chunk_index: chunkIndex,
			content,
			metadata: {
				...doc.metadata,
				chunk_index: chunkIndex,
			},
		};
	}

	/**
	 * Batch chunk documents
	 * 回填 total_chunks 和 doc_toc
	 */
	public chunkDocuments(docs: Document[]): Chunk[] {
		const allChunks: Chunk[] = [];

		for (const doc of docs) {
			const docChunks: Chunk[] = [];
			const toc = this.extractToc(doc.content);

			for (const chunk of this.chunkDocument(doc)) {
				chunk.metadata.doc_toc = toc;
				docChunks.push(chunk);
			}

			const total = docChunks.length;
			for (const chunk of docChunks) {
				chunk.metadata.total_chunks = total;
			}

			allChunks.push(...docChunks);
		}

		return allChunks;
	}

	/**
	 * 从文档内容提取目录结构（所有 Markdown header）
	 */
	protected extractToc(content: string): string {
		const lines = content.split('\n');
		const tocLines: string[] = [];

		for (const line of lines) {
			const match = line.match(/^(#{1,6})\s+(.+)/);
			if (match) {
				const indent = '  '.repeat(match[1].length - 1);
				tocLines.push(`${indent}${match[2].trim()}`);
			}
		}

		return tocLines.join('\n');
	}

	/**
	 * Split by Markdown headers
	 */
	protected splitByHeaders(content: string, levelPattern: string = '#{1,6}'): string[] {
		const pattern = new RegExp(`^(${levelPattern}\\s+.+)$`, 'gm');
		const headerTest = new RegExp(`^${levelPattern}\\s+`);
		const parts = content.split(pattern);

		const sections: string[] = [];
		let current = '';

		for (const part of parts) {
			if (headerTest.test(part)) {
				if (current.trim()) {
					sections.push(current.trim());
				}
				current = part + '\n';
			} else {
				current += part;
			}
		}

		if (current.trim()) {
			sections.push(current.trim());
		}

		return sections.length > 0 ? sections : [content];
	}

	/**
	 * Split while protecting code blocks
	 * 1. Identify code block positions
	 * 2. Only split outside code blocks
	 * 3. Keep long code blocks intact (allow exceeding chunk_size)
	 */
	protected splitProtected(text: string): string[] {
		if (text.length <= this.chunkSize) {
			return [text];
		}

		// Find all code block positions
		const codeBlockRegex = /```[\s\S]*?```/g;
		const codeBlocks: Array<{ start: number; end: number }> = [];

		let match: RegExpExecArray | null;
		while ((match = codeBlockRegex.exec(text)) !== null) {
			codeBlocks.push({ start: match.index, end: match.index + match[0].length });
		}

		// Split text into: regular segments and code blocks
		type Segment = { start: number; end: number; isCode: boolean };
		const segments: Segment[] = [];

		let pos = 0;
		for (const block of codeBlocks) {
			if (pos < block.start) {
				segments.push({ start: pos, end: block.start, isCode: false });
			}
			segments.push({ start: block.start, end: block.end, isCode: true });
			pos = block.end;
		}
		if (pos < text.length) {
			segments.push({ start: pos, end: text.length, isCode: false });
		}

		if (segments.length === 0) {
			return [text];
		}

		const chunks: string[] = [];
		let currentChunk = '';

		for (const { start, end, isCode } of segments) {
			const segmentText = text.slice(start, end);

			if (isCode) {
				// 代码块处理：小块合并，超大块切分
				if (currentChunk && currentChunk.length + segmentText.length <= this.chunkSize * CODE_BLOCK_SIZE_TOLERANCE) {
					currentChunk += segmentText;
				} else {
					if (currentChunk.trim()) {
						chunks.push(currentChunk.trim());
					}
					if (segmentText.length > this.chunkSize * CODE_BLOCK_SPLIT_THRESHOLD) {
						const codeChunks = this.splitCodeBlock(segmentText);
						for (let ci = 0; ci < codeChunks.length - 1; ci++) {
							if (codeChunks[ci].trim()) chunks.push(codeChunks[ci].trim());
						}
						currentChunk = codeChunks[codeChunks.length - 1];
					} else {
						currentChunk = segmentText;
					}
				}
			} else {
				// Regular text: can split
				if (currentChunk.length + segmentText.length <= this.chunkSize) {
					currentChunk += segmentText;
				} else {
					let remaining = segmentText;
					while (remaining) {
						const spaceLeft = this.chunkSize - currentChunk.length;
						if (remaining.length <= spaceLeft) {
							currentChunk += remaining;
							remaining = '';
						} else {
							const cutPoint = this.findBreakPoint(remaining, spaceLeft);
							currentChunk += remaining.slice(0, cutPoint);
							if (currentChunk.trim()) {
								chunks.push(currentChunk.trim());
							}
							currentChunk = '';
							remaining = remaining.slice(cutPoint);
						}
					}
				}
			}
		}

		if (currentChunk.trim() && currentChunk.trim().length >= this.minChunkSize) {
			chunks.push(currentChunk.trim());
		}

		return chunks.length > 0 ? chunks : [text];
	}

	/**
	 * Find best break point in text (URL-safe)
	 */
	protected findBreakPoint(text: string, maxPos: number): number {
		// 优先级：段落 > 换行 > 中文句号 > 英文句号（跳过 URL 内的点）
		const simpleSeps = ['\n\n', '\n', '\u3002'];
		for (const sep of simpleSeps) {
			const pos = text.lastIndexOf(sep, maxPos);
			if (pos > maxPos / 2) {
				return pos + sep.length;
			}
		}

		// '.' 需要额外判断：句末的 '.' 后跟空白/换行/EOF，URL 内的 '.' 后跟字母数字
		let searchPos = maxPos;
		const halfPos = maxPos / 2;
		while (searchPos > halfPos) {
			const pos = text.lastIndexOf('.', searchPos);
			if (pos <= halfPos) break;
			const next = text[pos + 1];
			if (!next || /\s/.test(next)) {
				return pos + 1;
			}
			searchPos = pos - 1;
		}

		return maxPos;
	}

	/**
	 * 提取 section 的首行 header（# 开头的行，含 # 前缀）
	 */
	protected extractHeader(section: string): string {
		const match = section.match(/^(#{1,6}\s+.+)/);
		return match?.[1] ?? '';
	}

	/**
	 * 提取 section 的首行 header 文字（不含 # 前缀）
	 */
	protected extractHeaderText(section: string): string {
		const match = section.match(/^#{1,6}\s+(.+)/);
		return match?.[1]?.trim() ?? '';
	}

	/**
	 * 切分超大代码块（空行 → 单行 → 硬切，保持 fence 完整）
	 */
	protected splitCodeBlock(codeBlock: string): string[] {
		const firstNewline = codeBlock.indexOf('\n');
		const fence = firstNewline > 0 ? codeBlock.slice(0, firstNewline) : '```';
		const inner = codeBlock.slice(firstNewline + 1, codeBlock.lastIndexOf('```'));
		const fenceOverhead = fence.length + 1 + 4; // fence + \n + \n```
		const contentBudget = this.chunkSize - fenceOverhead;

		// 先尝试按空行切，如果只有一块则按单行切
		let parts = inner.split(/\n\n+/);
		const separator = parts.length > 1 ? '\n\n' : '\n';
		if (parts.length <= 1) {
			parts = inner.split('\n');
		}

		const result: string[] = [];
		let current = '';

		for (const part of parts) {
			// 单个 part 超长（例如 base64 行）→ 硬切
			if (part.length > contentBudget) {
				if (current) {
					result.push(fence + '\n' + current.trimEnd() + '\n```');
					current = '';
				}
				for (let pos = 0; pos < part.length; pos += contentBudget) {
					const slice = part.slice(pos, pos + contentBudget);
					result.push(fence + '\n' + slice + '\n```');
				}
				continue;
			}

			const addition = part + separator;
			if (current.length + addition.length > contentBudget && current) {
				result.push(fence + '\n' + current.trimEnd() + '\n```');
				current = '';
			}
			current += addition;
		}

		if (current.trim()) {
			result.push(fence + '\n' + current.trimEnd() + '\n```');
		}

		return result.length > 0 ? result : [codeBlock];
	}

}
