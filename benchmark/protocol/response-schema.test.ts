/**
 * Layer 0: 响应结构测试
 *
 * 验证 search/fetch/get_code_guidelines 的返回结构和数据完整性。
 * 前置条件：MCP Server 已启动且已索引文档。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { z } from 'zod';
import {
	connectClient, disconnectClient,
	callSearch, callFetch, callGuidelines,
	getHealth,
	type MCPTestClient,
} from './helpers.js';

// ── 响应 Schema 定义 ──────────────────────────────────────

const ChunkMetadataSchema = z.object({
	category: z.string(),
	file_name: z.string(),
	path_hierarchy: z.array(z.string()),
}).passthrough();

const SearchResultSchema = z.object({
	rank: z.number().int().positive(),
	doc_id: z.string().min(1),
	chunk_id: z.string().min(1),
	score: z.number(),
	content: z.string().min(1),
	content_preview: z.string(),
	metadata: ChunkMetadataSchema,
});

const SearchResponseSchema = z.object({
	query: z.string().min(1),
	results: z.array(SearchResultSchema),
	search_time_ms: z.number().nonnegative(),
	rerank_used: z.boolean(),
	fusion_mode: z.enum(['rrf', 'dense_only']),
	detected_lang: z.string().min(1),
	doc_language: z.string().min(1),
});

// ── 测试 ──────────────────────────────────────────────────

describe('Response Schema Validation', () => {
	let products: Array<{ id: string }>;
	let ctx: MCPTestClient;

	beforeAll(async () => {
		const health = await getHealth();
		products = health.products;
		ctx = await connectClient(products[0].id);
	});

	afterAll(async () => {
		await disconnectClient(ctx);
	});

	describe('search tool response', () => {
		it('should match SearchResponseSchema', async () => {
			const response = await callSearch(ctx, '条件格式');
			const parsed = SearchResponseSchema.safeParse(response);

			if (!parsed.success) {
				console.error('Schema validation errors:', parsed.error.issues);
			}
			expect(parsed.success).toBe(true);
		});

		it('results should be sorted by rank ascending', async () => {
			const response = await callSearch(ctx, '图表');
			const data = SearchResponseSchema.parse(response);

			for (let i = 1; i < data.results.length; i++) {
				expect(data.results[i].rank).toBeGreaterThan(data.results[i - 1].rank);
			}
		});

		it('results should be sorted by score descending', async () => {
			const response = await callSearch(ctx, '公式');
			const data = SearchResponseSchema.parse(response);

			for (let i = 1; i < data.results.length; i++) {
				expect(data.results[i].score).toBeLessThanOrEqual(data.results[i - 1].score);
			}
		});

		it('limit parameter should be respected', async () => {
			const response = await callSearch(ctx, '导出', 3);
			const data = SearchResponseSchema.parse(response);

			expect(data.results.length).toBeLessThanOrEqual(3);
		});

		it('metadata should contain required fields for every result', async () => {
			const response = await callSearch(ctx, '单元格');
			const data = SearchResponseSchema.parse(response);

			for (const result of data.results) {
				expect(result.metadata.category).toBeTruthy();
				expect(result.metadata.file_name).toBeTruthy();
				expect(Array.isArray(result.metadata.path_hierarchy)).toBe(true);
			}
		});

		it('each result should have non-empty content and doc_id', async () => {
			const response = await callSearch(ctx, '数据绑定');
			const data = SearchResponseSchema.parse(response);

			for (const result of data.results) {
				expect(result.content.length).toBeGreaterThan(0);
				expect(result.doc_id.length).toBeGreaterThan(0);
				expect(result.chunk_id.length).toBeGreaterThan(0);
			}
		});

		it('search_time_ms should be reasonable', async () => {
			const response = await callSearch(ctx, '工作表');
			const data = SearchResponseSchema.parse(response);

			// 搜索应在 10 秒内完成
			expect(data.search_time_ms).toBeLessThan(10_000);
		});
	});

	describe('fetch tool response', () => {
		it('should return content array for valid doc_id', async () => {
			// 先搜索获取一个 doc_id
			const searchResult = await callSearch(ctx, '条件格式');
			const data = SearchResponseSchema.parse(searchResult);

			if (data.results.length === 0) return; // 跳过（无数据）

			const docId = data.results[0].doc_id;
			const content = await callFetch(ctx, docId);

			expect(Array.isArray(content)).toBe(true);
			expect(content.length).toBeGreaterThan(0);

			for (const item of content) {
				expect(item.type).toBe('text');
				expect(item.text.length).toBeGreaterThan(0);
			}
		});
	});

	describe('get_code_guidelines tool response', () => {
		it('should return non-empty content', async () => {
			const content = await callGuidelines(ctx);

			expect(Array.isArray(content)).toBe(true);
			expect(content.length).toBeGreaterThan(0);

			for (const item of content) {
				expect(item.type).toBe('text');
				expect(item.text.length).toBeGreaterThan(0);
			}
		});

		it('should contain version number', async () => {
			const content = await callGuidelines(ctx);
			const allText = content.map(c => c.text).join('\n');

			// 应包含版本号格式（如 19.0.0）
			expect(allText).toMatch(/\d+\.\d+\.\d+/);
		});
	});

	describe('Multi-product response schema', () => {
		it('all products should return valid search schema', async () => {
			for (const product of products) {
				const productCtx = await connectClient(product.id);

				try {
					const response = await callSearch(productCtx, '文档');
					const parsed = SearchResponseSchema.safeParse(response);

					expect(
						parsed.success,
						`Product ${product.id}: schema validation failed - ${
							!parsed.success ? parsed.error.issues.map(i => i.message).join(', ') : ''
						}`,
					).toBe(true);
				} finally {
					await disconnectClient(productCtx);
				}
			}
		});
	});
});
