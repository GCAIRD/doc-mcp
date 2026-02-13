/**
 * Document loader for GC-DOC-MCP v2
 * Loads Markdown documents from directory, extracts directory structure as metadata
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { Document, DocumentCategory } from './types.js';
import { createDefaultLogger } from '../shared/logger.js';

const logger = createDefaultLogger('document:loader');

const CATEGORY_MAP: Record<string, DocumentCategory> = {
	apis: 'api',
	docs: 'doc',
	demos: 'demo',
};

/**
 * Clean HTML tags and CSS styles from Markdown
 * Keep: code blocks, images, links
 * Remove: span tags, br, style attributes, Word export attributes
 */
export function cleanHtmlFromMarkdown(content: string): string {
	// Protect code blocks
	const codeBlocks: string[] = [];

	const saveCodeBlock = (match: string): string => {
		codeBlocks.push(match);
		return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
	};

	let cleaned = content.replace(/```[\s\S]*?```/g, saveCodeBlock);

	// Handle nested spans (multiple passes)
	const MAX_NESTED_SPAN_PASSES = 5;
	for (let i = 0; i < MAX_NESTED_SPAN_PASSES; i++) {
		const prev = cleaned;
		cleaned = cleaned.replace(/<span[^>]*>([^<]*)<\/span>/g, '$1');
		if (cleaned === prev) break;
	}

	// Remove remaining empty or complex spans
	cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/g, '');
	cleaned = cleaned.replace(/<span[^>]*>/g, '');
	cleaned = cleaned.replace(/<\/span>/g, '');

	// <br> → newline
	cleaned = cleaned.replace(/<br\s*\/?>/g, '\n');

	// Remove Word export attributes
	cleaned = cleaned.replace(/\s*data-ccp-props="[^"]*"/g, '');

	// Clean style attributes
	cleaned = cleaned.replace(/\s*style="[^"]*"/g, '');
	cleaned = cleaned.replace(/\s*class="[^"]*"/g, '');

	// Clean excess whitespace
	cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
	cleaned = cleaned.replace(/ {2,}/g, ' ');

	// Restore code blocks
	for (let i = 0; i < codeBlocks.length; i++) {
		cleaned = cleaned.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
	}

	return cleaned.trim();
}

export class DocumentLoader {
	private readonly baseDir: string;
	private readonly categoryMap: Record<string, DocumentCategory>;

	constructor(baseDir: string) {
		this.baseDir = baseDir;
		this.categoryMap = CATEGORY_MAP;
	}

	private extractMetadata(filePath: string): Document['metadata'] {
		const relPath = path.relative(this.baseDir, filePath);
		const parts = relPath.split(path.sep).filter(Boolean);

		const metadata: Document['metadata'] = {
			file_path: filePath,
			relative_path: relPath,
			file_name: path.basename(filePath, path.extname(filePath)),
			path_hierarchy: parts.slice(0, -1),
		};

		if (parts.length > 0) {
			const topDir = parts[0].toLowerCase();
			metadata.category = this.categoryMap[topDir] ?? (topDir as DocumentCategory);
		}

		return metadata;
	}

	private async loadFile(filePath: string): Promise<Document | null> {
		try {
			let content = await fs.readFile(filePath, 'utf-8');

			if (!content.trim()) {
				return null;
			}

			content = cleanHtmlFromMarkdown(content);
			const metadata = this.extractMetadata(filePath);

			// Generate document ID from relative path
			let docId = metadata.relative_path.replace(/\\/g, '/').replace(/\//g, '_');
			docId = docId.replace(/\.[^.]+$/, '');

			return {
				id: docId,
				content,
				metadata,
			};
		} catch (e) {
			logger.warn(`Failed to load file ${filePath}: ${e}`);
			return null;
		}
	}

	public async *loadDirectory(
		subdirs?: string[],
		extensions: string[] = ['.md', '.java'],
	): AsyncGenerator<Document> {
		const searchDirs: string[] = [];

		if (subdirs) {
			for (const subdir of subdirs) {
				const dir = path.join(this.baseDir, subdir);
				try {
					const stat = await fs.stat(dir);
					if (stat.isDirectory()) {
						searchDirs.push(dir);
					}
				} catch {
					// Directory doesn't exist, skip
				}
			}
		} else {
			searchDirs.push(this.baseDir);
		}

		for (const searchDir of searchDirs) {
			for (const ext of extensions) {
				const files = await this.findFiles(searchDir, ext);
				for (const filePath of files) {
					const doc = await this.loadFile(filePath);
					if (doc) {
						yield doc;
					}
				}
			}
		}
	}

	private async findFiles(dir: string, ext: string): Promise<string[]> {
		const files: string[] = [];
		const entries = await fs.readdir(dir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);

			if (entry.isDirectory()) {
				const subFiles = await this.findFiles(fullPath, ext);
				files.push(...subFiles);
			} else if (entry.isFile() && entry.name.endsWith(ext)) {
				files.push(fullPath);
			}
		}

		return files;
	}

	public async loadAll(subdirs?: string[]): Promise<Document[]> {
		const docs: Document[] = [];
		for await (const doc of this.loadDirectory(subdirs)) {
			docs.push(doc);
		}
		return docs;
	}
}
