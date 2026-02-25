/**
 * MCP Client 测试辅助函数
 * 封装连接、调用、断开逻辑，供测试用例复用
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE_URL = process.env.MCP_BASE_URL ?? 'http://localhost:8902';

export interface MCPTestClient {
	client: Client;
	transport: StreamableHTTPClientTransport;
	productId: string;
}

/**
 * 创建并连接一个 MCP Client 到指定产品端点
 */
export async function connectClient(productId: string): Promise<MCPTestClient> {
	const url = new URL(`/mcp/${productId}`, BASE_URL);
	const transport = new StreamableHTTPClientTransport(url);
	const client = new Client({ name: 'benchmark-test', version: '1.0.0' });
	await client.connect(transport);
	return { client, transport, productId };
}

/**
 * 断开 MCP Client
 */
export async function disconnectClient(ctx: MCPTestClient): Promise<void> {
	await ctx.client.close();
}

/**
 * 调用 search tool
 */
export async function callSearch(
	ctx: MCPTestClient,
	query: string,
	limit?: number,
): Promise<unknown> {
	const args: Record<string, unknown> = { query };
	if (limit !== undefined) args.limit = limit;

	const result = await ctx.client.callTool({ name: 'search', arguments: args });
	// MCP tool 返回 content 数组，第一条是 JSON 文本
	const textItem = (result.content as Array<{ type: string; text: string }>)[0];
	return JSON.parse(textItem.text);
}

/**
 * 调用 fetch tool
 */
export async function callFetch(
	ctx: MCPTestClient,
	docId: string,
): Promise<Array<{ type: string; text: string }>> {
	const result = await ctx.client.callTool({ name: 'fetch', arguments: { doc_id: docId } });
	return result.content as Array<{ type: string; text: string }>;
}

/**
 * 调用 get_code_guidelines tool
 */
export async function callGuidelines(
	ctx: MCPTestClient,
): Promise<Array<{ type: string; text: string }>> {
	const result = await ctx.client.callTool({ name: 'get_code_guidelines', arguments: {} });
	return result.content as Array<{ type: string; text: string }>;
}

/**
 * 获取 /health 端点信息
 */
export async function getHealth(): Promise<{
	status: string;
	products: Array<{ id: string; lang: string; collection: string; endpoint: string }>;
}> {
	const res = await fetch(`${BASE_URL}/health`);
	return res.json();
}
