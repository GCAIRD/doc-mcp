/**
 * TypeDoc API document chunker for GC-DOC-MCP v2
 *
 * Designed for SpreadJS three document types:
 * - APIs: TypeDoc generated, split by h3 members, prepend class context
 * - Docs: Multi-level Markdown, h2 → h3 cascading split
 * - Demos: Code-heavy, protect blocks with smart splitting
 */

import { BaseChunker } from './base.js';
import { Document, Chunk } from '../types.js';

/** TypeDoc TOC 区域的 h2 标题（跳过，不含实际 API 内容） */
const TOC_HEADERS = ['Content', 'Table of contents', 'Hierarchy'];

export class TypeDocChunker extends BaseChunker {
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
	 * API 文档策略：
	 * 1. 提取第一行 h1 作为 classHeader
	 * 2. 跳过 TOC 区域，找到实际内容起点
	 * 3. 按 h2/h3 切分出成员
	 * 4. 合并相邻小成员，每个 chunk 前缀 classHeader
	 */
	private *chunkApi(doc: Document): Generator<Chunk> {
		const content = doc.content;

		// 小文件直出
		if (content.length <= this.chunkSize) {
			yield this.createChunk(doc, 0, content, 'api');
			return;
		}

		const lines = content.split('\n');

		// 提取 classHeader：第一个 h1
		const firstLine = lines[0];
		const classHeader = firstLine?.startsWith('# ') ? firstLine : '';

		// 找到实际内容起点（跳过 TOC 区域）
		// TOC 区域的 h2 是 Content / Table of contents / Hierarchy
		// 实际内容从第一个非 TOC 的 h2 开始
		let detailsStart = -1;
		for (let i = 0; i < lines.length; i++) {
			const h2Match = lines[i].match(/^## (.+)/);
			if (h2Match && !TOC_HEADERS.includes(h2Match[1].trim())) {
				detailsStart = i;
				break;
			}
		}

		if (detailsStart < 0) {
			// 没有标准 TypeDoc 结构，按大小切分
			yield* this.chunkBySize(doc, classHeader);
			return;
		}

		// 对 details 区域按 h2+h3 切分
		const detailContent = lines.slice(detailsStart).join('\n');
		const members = this.splitByHeaders(detailContent, '#{2,3}');

		// 过滤过小的片段（TOC 残留、纯标题行）
		const validMembers = members.filter(m => m.trim().length >= this.minChunkSize);

		if (validMembers.length < 2) {
			yield* this.chunkBySize(doc, classHeader);
			return;
		}

		// 合并相邻成员直到逼近 chunkSize
		const headerBudget = classHeader.length + 10;
		let chunkIndex = 0;
		let group: string[] = [];
		let groupSize = 0;

		for (const member of validMembers) {
			if (groupSize + member.length > this.chunkSize - headerBudget && group.length > 0) {
				yield this.createChunk(
					doc, chunkIndex,
					classHeader + '\n\n---\n\n' + group.join('\n\n'),
					'api',
				);
				chunkIndex++;
				group = [];
				groupSize = 0;
			}

			group.push(member);
			groupSize += member.length + 2;
		}

		if (group.length > 0) {
			yield this.createChunk(
				doc, chunkIndex,
				classHeader + '\n\n---\n\n' + group.join('\n\n'),
				'api',
			);
		}
	}

	/**
	 * Docs 文档策略：h2 主切 → h3 二次切 → splitProtected + header 上下文
	 */
	private *chunkDocs(doc: Document): Generator<Chunk> {
		if (doc.content.length <= this.chunkSize) {
			if (doc.content.trim().length >= this.minChunkSize) {
				yield this.createChunk(doc, 0, doc.content, 'doc');
			}
			return;
		}

		const sections = this.splitByHeaders(doc.content, '#{2}');
		let chunkIndex = 0;

		for (const section of sections) {
			const h2 = this.extractHeaderText(section);

			if (section.length <= this.chunkSize) {
				if (section.trim().length >= this.minChunkSize) {
					const chunk = this.createChunk(doc, chunkIndex, section, 'doc');
					if (h2) chunk.metadata.section_path = [h2];
					yield chunk;
					chunkIndex++;
				}
				continue;
			}

			// h2 section 太大 → h3 二次切分
			const subSections = this.splitByHeaders(section, '#{3}');
			const sectionHeader = this.extractHeader(section);

			for (const sub of subSections) {
				const h3 = this.extractHeaderText(sub);
				const path = [h2, h3].filter(Boolean) as string[];
				const textChunks = this.splitProtected(sub);

				for (let i = 0; i < textChunks.length; i++) {
					let text = textChunks[i];
					if (text.trim().length < this.minChunkSize) continue;
					if (i > 0 && sectionHeader && !text.startsWith('#')) {
						text = sectionHeader + '\n\n' + text;
					}
					const chunk = this.createChunk(doc, chunkIndex, text, 'doc');
					if (path.length > 0) chunk.metadata.section_path = path;
					yield chunk;
					chunkIndex++;
				}
			}
		}
	}

	/**
	 * Demo 文档策略：小文件整体输出，大文件走 splitProtected（含代码块切分）
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
	 * 按大小切分 + header 上下文（fallback）
	 */
	private *chunkBySize(doc: Document, header: string): Generator<Chunk> {
		const chunks = this.splitProtected(doc.content);
		let chunkIndex = 0;

		for (let i = 0; i < chunks.length; i++) {
			let text = chunks[i];
			if (text.trim().length < this.minChunkSize) continue;
			if (i > 0 && header && !text.startsWith('#')) {
				text = header + '\n\n' + text;
			}
			yield this.createChunk(doc, chunkIndex, text, 'api');
			chunkIndex++;
		}
	}
}
