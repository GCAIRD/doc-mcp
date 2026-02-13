/**
 * Markdown chunker for GC-DOC-MCP v2
 *
 * Strategy:
 * 1. Split by headers (#)
 * 2. Secondary split by char count for long sections
 * 3. Protect code block integrity
 */

import { BaseChunker } from './base.js';
import { Document, Chunk } from '../types.js';

export class MarkdownChunker extends BaseChunker {
	/**
	 * Chunk the document
	 */
	public *chunkDocument(doc: Document): Generator<Chunk> {
		const sections = this.splitByHeaders(doc.content);

		let chunkIndex = 0;
		for (const section of sections) {
			const textChunks = this.splitProtected(section);

			for (const text of textChunks) {
				if (text.trim().length < this.minChunkSize) continue;
				yield this.createChunk(doc, chunkIndex, text);
				chunkIndex++;
			}
		}
	}
}
