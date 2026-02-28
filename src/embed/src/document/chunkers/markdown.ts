/**
 * Markdown chunker for GC-DOC-MCP v2
 *
 * Strategy:
 * 1. Small docs (< chunkSize) → output whole
 * 2. Split by h2 as primary boundary
 * 3. h2 section still too large → secondary split by h3
 * 4. Protect code block integrity + header context prefix
 */

import { BaseChunker } from './base.js';
import { Document, Chunk } from '../types.js';

export class MarkdownChunker extends BaseChunker {
	public *chunkDocument(doc: Document): Generator<Chunk> {
		// 小文件直接输出
		if (doc.content.length <= this.chunkSize) {
			if (doc.content.trim().length >= this.minChunkSize) {
				yield this.createChunk(doc, 0, doc.content);
			}
			return;
		}

		// 按 h2 切分（主级别）
		const sections = this.splitByHeaders(doc.content, '#{2}');

		let chunkIndex = 0;
		for (const section of sections) {
			const h2 = this.extractHeaderText(section);

			if (section.length <= this.chunkSize) {
				if (section.trim().length >= this.minChunkSize) {
					const chunk = this.createChunk(doc, chunkIndex, section);
					if (h2) chunk.metadata.section_path = [h2];
					yield chunk;
					chunkIndex++;
				}
				continue;
			}

			// h2 section 仍然太大 → 按 h3 二次切分
			const subSections = this.splitByHeaders(section, '#{3}');
			const sectionHeader = this.extractHeader(section);

			for (const sub of subSections) {
				const h3 = this.extractHeaderText(sub);
				const path = [h2, h3].filter(Boolean) as string[];
				const textChunks = this.splitProtected(sub);

				for (let i = 0; i < textChunks.length; i++) {
					let text = textChunks[i];
					if (text.trim().length < this.minChunkSize) continue;
					// 非首块且缺少 header → 补上 section header
					if (i > 0 && sectionHeader && !text.startsWith('#')) {
						text = sectionHeader + '\n\n' + text;
					}
					const chunk = this.createChunk(doc, chunkIndex, text);
					if (path.length > 0) chunk.metadata.section_path = path;
					yield chunk;
					chunkIndex++;
				}
			}
		}
	}
}
