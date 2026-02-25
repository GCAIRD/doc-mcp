/**
 * promptfoo exec provider 脚本
 *
 * 通过 MCP SDK Client 调用 search tool，返回 JSON 结果。
 * 用法: node retrieval/call-search.js <productId> "<query>" [limit]
 *
 * 返回值写入 stdout，promptfoo 读取并传递给断言。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE_URL = process.env.MCP_BASE_URL ?? 'http://localhost:8902';

const [, , productId, query, limitStr] = process.argv;

if (!productId || !query) {
	console.error('Usage: node call-search.js <productId> "<query>" [limit]');
	process.exit(1);
}

const limit = limitStr ? parseInt(limitStr, 10) : undefined;

try {
	const url = new URL(`/mcp/${productId}`, BASE_URL);
	const transport = new StreamableHTTPClientTransport(url);
	const client = new Client({ name: 'promptfoo-eval', version: '1.0.0' });

	await client.connect(transport);

	const args = { query };
	if (limit !== undefined) args.limit = limit;

	const result = await client.callTool({ name: 'search', arguments: args });
	const textItem = result.content[0];
	const response = JSON.parse(textItem.text);

	// 输出 JSON 给 promptfoo
	console.log(JSON.stringify(response));

	await client.close();
} catch (err) {
	console.error('Search call failed:', err.message);
	process.exit(1);
}
