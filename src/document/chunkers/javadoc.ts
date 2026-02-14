/**
 * JavaDoc API document chunker for GC-DOC-MCP v2
 *
 * Designed for GcExcel three document types:
 * - APIs: JavaDoc style, split by methods
 * - Demos: Short examples, keep whole
 * - Docs: Multi-level headers, protect code blocks
 */

import { BaseChunker } from './base.js';
import { Document, Chunk } from '../types.js';

/** API header 向下扫描的最大行数 */
const HEADER_SCAN_MAX_LINES = 30;
/** 未找到 summary 时的 header 截止行 */
const HEADER_FALLBACK_END = 15;
/** 低于此方法数则退回按大小切分 */
const MIN_METHODS_FOR_SPLIT = 3;

const HEADER_END_MARKERS = ['## Method Summary', '## Field Summary'];
const DETAILS_MARKERS = ['## Method Details', '## Method Detail'];

export class JavaDocChunker extends BaseChunker {
	/**
	 * Select chunking strategy based on document type
	 */
	public *chunkDocument(doc: Document): Generator<Chunk> {
		const category = doc.metadata.category ?? 'doc';

		switch (category) {
			case 'api':
				yield* this.chunkApi(doc);
				break;
			case 'demo':
				yield* this.chunkDemo(doc);
				break;
			default:
				yield* this.chunkDocs(doc);
		}
	}

	/**
	 * Yield a group of methods as a single chunk
	 */
	private *yieldMethodGroup(
		doc: Document,
		header: string,
		group: string[],
		chunkIndex: number,
		sectionPath?: string[],
	): Generator<Chunk> {
		const combined = header
			? `${header}\n\n---\n\n${group.join('\n\n')}`
			: group.join('\n\n');
		const chunk = this.createChunk(doc, chunkIndex, combined, 'api_methods');
		if (sectionPath && sectionPath.length > 0) chunk.metadata.section_path = sectionPath;
		yield chunk;
	}

	/**
	 * API document chunking strategy:
	 * 1. Extract class/interface header as context
	 * 2. Split by ### methodName
	 * 3. Each method chunk includes class context
	 */
	private *chunkApi(doc: Document): Generator<Chunk> {
		const content = doc.content;
		const lines = content.split('\n');
		const className = this.extractHeaderText(content);

		// Extract header: class name, package, description
		let headerEnd = 0;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (HEADER_END_MARKERS.some(m => line.includes(m))) {
				headerEnd = i;
				break;
			}
			if (i > HEADER_SCAN_MAX_LINES) {
				headerEnd = HEADER_FALLBACK_END;
				break;
			}
		}

		const header = lines.slice(0, headerEnd).join('\n').trim();

		// Find Method Details section
		let detailsStart: number | null = null;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (DETAILS_MARKERS.some(m => line.includes(m))) {
				detailsStart = i;
				break;
			}
		}

		if (detailsStart === null) {
			yield* this.chunkBySize(doc);
			return;
		}

		// Split methods by `### methodName` or `+ ### methodName`
		const methods: string[] = [];
		let currentMethod: string[] = [];
		const methodPattern = /^\s*\+?\s*###\s+\w+/;

		for (let i = detailsStart; i < lines.length; i++) {
			const line = lines[i];
			if (methodPattern.test(line)) {
				if (currentMethod.length > 0) {
					methods.push(currentMethod.join('\n').trim());
				}
				currentMethod = [line];
			} else {
				currentMethod.push(line);
			}
		}

		if (currentMethod.length > 0) {
			methods.push(currentMethod.join('\n').trim());
		}

		// If too few methods, chunk by size
		if (methods.length < MIN_METHODS_FOR_SPLIT) {
			yield* this.chunkBySize(doc);
			return;
		}

		// Group methods and output
		let chunkIndex = 0;
		const group: string[] = [];
		let groupSize = 0;
		const basePath = [className, 'Method Details'].filter(Boolean);

		for (const method of methods) {
			if (groupSize + method.length > this.chunkSize && group.length > 0) {
				yield* this.yieldMethodGroup(doc, header, group, chunkIndex, basePath);
				chunkIndex++;
				group.length = 0;
				groupSize = 0;
			}

			group.push(method);
			groupSize += method.length;
		}

		if (group.length > 0) {
			yield* this.yieldMethodGroup(doc, header, group, chunkIndex, basePath);
		}
	}

	/**
	 * Demo document: keep short docs whole, split large code blocks
	 */
	private *chunkDemo(doc: Document): Generator<Chunk> {
		const title = this.extractHeaderText(doc.content);

		if (doc.content.length <= this.chunkSize) {
			const chunk = this.createChunk(doc, 0, doc.content, 'demo');
			if (title) chunk.metadata.section_path = [title];
			yield chunk;
			return;
		}

		const header = this.extractHeader(doc.content);
		const chunks = this.splitProtected(doc.content);
		let chunkIndex = 0;

		for (let i = 0; i < chunks.length; i++) {
			let text = chunks[i];
			if (text.trim().length < this.minChunkSize) continue;
			if (i > 0 && header && !text.startsWith('#') && !text.startsWith('```')) {
				text = header + '\n\n' + text;
			}
			const chunk = this.createChunk(doc, chunkIndex, text, 'demo');
			if (title) chunk.metadata.section_path = [title];
			yield chunk;
			chunkIndex++;
		}
	}

	/**
	 * Docs document: split by ## or ### headers
	 */
	private *chunkDocs(doc: Document): Generator<Chunk> {
		const sections = this.splitByHeaders(doc.content, '#{2,3}');

		let chunkIndex = 0;
		for (const section of sections) {
			const h = this.extractHeaderText(section);
			for (const text of this.splitProtected(section)) {
				if (text.trim().length < this.minChunkSize) continue;
				const chunk = this.createChunk(doc, chunkIndex, text, 'docs');
				if (h) chunk.metadata.section_path = [h];
				yield chunk;
				chunkIndex++;
			}
		}
	}

	/**
	 * Chunk by size (fallback)
	 */
	private *chunkBySize(doc: Document): Generator<Chunk> {
		const chunksText = this.splitProtected(doc.content);
		let chunkIndex = 0;

		for (const text of chunksText) {
			if (text.trim().length < this.minChunkSize) continue;
			yield this.createChunk(doc, chunkIndex, text);
			chunkIndex++;
		}
	}
}
