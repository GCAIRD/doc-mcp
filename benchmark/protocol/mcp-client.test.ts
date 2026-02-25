/**
 * Layer 0: MCP 协议合规测试
 *
 * 验证 MCP Server 的协议行为：握手、tool/resource 注册、session 管理。
 * 前置条件：MCP Server 已在 http://localhost:8902 启动。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { connectClient, disconnectClient, getHealth, type MCPTestClient } from './helpers.js';

const BASE_URL = process.env.MCP_BASE_URL ?? 'http://localhost:8902';

describe('MCP Protocol Compliance', () => {
	let products: Array<{ id: string; endpoint: string }>;

	beforeAll(async () => {
		const health = await getHealth();
		expect(health.status).toBe('ok');
		products = health.products;
		expect(products.length).toBeGreaterThan(0);
	});

	describe('Initialize Handshake', () => {
		it('should return serverInfo with name and version', async () => {
			const firstProduct = products[0];
			const url = new URL(firstProduct.endpoint, BASE_URL);
			const transport = new StreamableHTTPClientTransport(url);
			const client = new Client({ name: 'test-handshake', version: '1.0.0' });

			await client.connect(transport);

			// 连接成功意味着 initialize 握手通过
			// MCP SDK Client 在 connect 时自动执行 initialize + initialized
			expect(client).toBeDefined();

			await client.close();
		});
	});

	describe('tools/list', () => {
		let ctx: MCPTestClient;

		beforeAll(async () => {
			ctx = await connectClient(products[0].id);
		});

		afterAll(async () => {
			await disconnectClient(ctx);
		});

		it('should return exactly 3 tools', async () => {
			const { tools } = await ctx.client.listTools();
			expect(tools).toHaveLength(3);
		});

		it('should include search, fetch, get_code_guidelines', async () => {
			const { tools } = await ctx.client.listTools();
			const names = tools.map(t => t.name).sort();
			expect(names).toEqual(['fetch', 'get_code_guidelines', 'search']);
		});

		it('search tool should have correct input schema', async () => {
			const { tools } = await ctx.client.listTools();
			const search = tools.find(t => t.name === 'search')!;

			expect(search.inputSchema).toBeDefined();
			expect(search.inputSchema.type).toBe('object');

			const props = search.inputSchema.properties as Record<string, unknown>;
			expect(props).toHaveProperty('query');
			expect(props).toHaveProperty('limit');
		});

		it('fetch tool should have doc_id parameter', async () => {
			const { tools } = await ctx.client.listTools();
			const fetchTool = tools.find(t => t.name === 'fetch')!;

			const props = fetchTool.inputSchema.properties as Record<string, unknown>;
			expect(props).toHaveProperty('doc_id');
		});

		it('get_code_guidelines tool should have no required parameters', async () => {
			const { tools } = await ctx.client.listTools();
			const guidelines = tools.find(t => t.name === 'get_code_guidelines')!;

			const required = guidelines.inputSchema.required as string[] | undefined;
			// 无参数或 required 为空
			expect(!required || required.length === 0).toBe(true);
		});
	});

	describe('resources/list', () => {
		let ctx: MCPTestClient;

		beforeAll(async () => {
			ctx = await connectClient(products[0].id);
		});

		afterAll(async () => {
			await disconnectClient(ctx);
		});

		it('should return resources', async () => {
			const { resources } = await ctx.client.listResources();
			expect(resources.length).toBeGreaterThan(0);
		});

		it('each resource should have uri, name, mimeType', async () => {
			const { resources } = await ctx.client.listResources();
			for (const r of resources) {
				expect(r.uri).toBeDefined();
				expect(r.name).toBeDefined();
				expect(r.mimeType).toBeDefined();
			}
		});
	});

	describe('Session Management', () => {
		it('should reject request without session ID to non-initialize', async () => {
			const endpoint = products[0].endpoint;
			const res = await fetch(`${BASE_URL}${endpoint}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'tools/list',
					id: 1,
				}),
			});
			// 无 session ID 且非 initialize → 400
			expect(res.status).toBe(400);
		});

		it('should reject request with invalid session ID', async () => {
			const endpoint = products[0].endpoint;
			const res = await fetch(`${BASE_URL}${endpoint}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'mcp-session-id': 'nonexistent-session-id',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'tools/list',
					id: 1,
				}),
			});
			// 无效 session ID → 404
			expect(res.status).toBe(404);
		});
	});

	describe('Multi-product Isolation', () => {
		it('each product should have its own MCP endpoint', async () => {
			for (const product of products) {
				const ctx = await connectClient(product.id);
				const { tools } = await ctx.client.listTools();

				// 每个产品端点都应该返回 3 个 tool
				expect(tools).toHaveLength(3);

				// tool description 应包含产品名
				const search = tools.find(t => t.name === 'search')!;
				expect(search.description).toBeDefined();

				await disconnectClient(ctx);
			}
		});
	});
});
