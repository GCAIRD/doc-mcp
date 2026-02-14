/**
 * MCP Server for GC-DOC-MCP v2
 *
 * 使用官方 @modelcontextprotocol/sdk 实现 MCP Server
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ResolvedConfig } from '../config/types.js';
import type { ISearcher } from '../rag/types.js';
import { getVersion } from '../config/loader.js';
import { createDefaultLogger } from '../shared/logger.js';
import { buildInstructions } from './instructions.js';
import { createSearchHandler } from './tools/search.js';
import { createFetchHandler } from './tools/fetch.js';
import { createGuidelinesHandler } from './tools/guidelines.js';

const logger = createDefaultLogger('mcp:server');

/**
 * MCP Server 类封装
 */
export class MCPServer {
	private server: McpServer;
	private config: ResolvedConfig;

	constructor(config: ResolvedConfig, searcher: ISearcher, version: string) {
		this.config = config;

		this.server = new McpServer(
			{ name: 'GC-DOC-MCP-Server', version },
			{ instructions: buildInstructions(config) },
		);

		this.setupTools(searcher);
		this.setupResources();

		logger.info(`MCPServer created: v${version}, ${config.product.name} (${config.variant.lang})`);
	}

	/**
	 * 注册 tools
	 */
	private setupTools(searcher: ISearcher): void {
		const defaultLimit = this.config.product.search.default_limit;

		this.server.tool(
			'search',
			`Search ${this.config.variant.description} documentation. Returns ranked results with doc_id for fetching full content.`,
			{
				query: z.string().describe('Natural language search query'),
				limit: z.number().int().min(1).max(20).default(defaultLimit)
					.describe('Maximum number of results to return (1-20)'),
			},
			createSearchHandler(this.config, searcher),
		);

		this.server.tool(
			'fetch',
			`Fetch full document content from ${this.config.product.name} documentation by doc_id.`,
			{ doc_id: z.string().describe('Document ID to fetch (obtained from search results)') },
			createFetchHandler(this.config, searcher),
		);

		this.server.tool(
			'get_code_guidelines',
			'Get CDN scripts and npm package information for this product. Call BEFORE generating code with imports.',
			{},
			createGuidelinesHandler(this.config),
		);

		logger.debug('Tools registered: search, fetch, get_code_guidelines');
	}

	/**
	 * 注册 resources（遍历配置中所有 resources）
	 */
	private setupResources(): void {
		for (const [key, resource] of Object.entries(this.config.variant.resources)) {
			const uri = `guidelines://${key}`;
			this.server.resource(
				key,
				uri,
				{ description: resource.description, mimeType: resource.mimeType },
				async () => ({
					contents: [{ uri, mimeType: resource.mimeType, text: resource.content }],
				}),
			);
		}
	}

	/**
	 * 获取底层 McpServer 实例（用于 connect transport）
	 */
	getServer(): McpServer {
		return this.server;
	}

}

/**
 * 异步工厂：读取 package.json 版本号后创建 MCPServer
 */
export async function createMCPServer(
	config: ResolvedConfig,
	searcher: ISearcher,
): Promise<MCPServer> {
	const version = await getVersion();
	return new MCPServer(config, searcher, version);
}
