/**
 * HTTP Server for GC-DOC-MCP v2
 *
 * Express + MCP Streamable HTTP endpoint (multi-product)
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedConfig } from '@gc-doc/shared';
import { createDefaultLogger, getClientConfig, getClaudeCodeCommand, CLIENTS } from '@gc-doc/shared';
import type { ISearcher } from './rag/types.js';
import { MCPServer } from './protocol/server.js';
import { requestContext, type RequestContext } from './request-context.js';

const httpLogger = createDefaultLogger('http');
const sessionLogger = createDefaultLogger('mcp:session');

/**
 * 生成结构化 Markdown 服务描述，供 AI agent 通过 Accept: text/markdown 获取
 */
function generateServiceMarkdown(products: ProductEntry[], baseUrl: string, version: string): string {
	const productSections = products.map((p) => {
		const endpoint = `${baseUrl}/mcp/${p.config.product.id}`;
		const id = p.config.product.id;
		const input = { endpoint, serverName: `${id}-mcp` };

		const clientConfigs = [
			`**Claude Code** (CLI):`,
			'```bash',
			getClaudeCodeCommand(id, endpoint),
			'```',
			'',
			...CLIENTS.map((c) => {
				const label = c.configNote ? `**${c.label}** (\`${c.configNote}\`)` : `**${c.label}**`;
				return [
					`${label}:`,
					'```json',
					JSON.stringify(getClientConfig(c.id, input), null, 2),
					'```',
					'',
				].join('\n');
			}),
		];

		return [
			`### ${p.config.product.name}`,
			'',
			`- **Endpoint**: \`${endpoint}\``,
			`- **Transport**: Streamable HTTP`,
			`- **Language**: ${p.config.variant.lang}`,
			'',
			'#### Setup',
			'',
			...clientConfigs,
		].join('\n');
	});

	return [
		'---',
		'title: MESCIUS DOC MCP',
		`description: MCP Server for developer components of MESCIUS`,
		`version: ${version}`,
		'transport: Streamable HTTP',
		'---',
		'',
		'# MESCIUS DOC MCP',
		'',
		'MCP Server providing documentation search for MESCIUS developer components.',
		'',
		'## Tools',
		'',
		'- **search** — Search documentation with a natural language query. Returns ranked results.',
		'- **fetch** — Retrieve full document content by doc_id.',
		'- **get_code_guidelines** — Get CDN/npm import references for code generation.',
		'',
		'## Available Products',
		'',
		...productSections,
	].join('\n');
}


/** Session 超时时间：30 分钟 */
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Session 清理扫描间隔：5 分钟 */
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export interface ProductEntry {
	config: ResolvedConfig;
	searcher: ISearcher;
}

export interface ServerHandle {
	server: HttpServer;
	close: () => Promise<void>;
}

interface SessionEntry {
	transport: StreamableHTTPServerTransport;
	lastActivity: number;
	clientInfo: { name: string; version: string } | null;
}

/** JSON-RPC 错误响应 */
function jsonRpcError(res: Response, httpStatus: number, code: number, message: string): void {
	res.status(httpStatus).json({
		jsonrpc: '2.0',
		error: { code, message },
		id: null,
	});
}

/**
 * 为单个产品创建 MCP handler（独立 session 池 + TTL 清理）
 */
function createMcpHandler(config: ResolvedConfig, searcher: ISearcher, version: string) {
	const sessions = new Map<string, SessionEntry>();

	// 定期清理超时 session
	const cleanupTimer = setInterval(() => {
		const now = Date.now();
		for (const [sid, entry] of sessions) {
			if (now - entry.lastActivity > SESSION_TTL_MS) {
				entry.transport.close?.();
				sessions.delete(sid);
				sessionLogger.info('Session expired', { productId: config.product.id, sessionId: sid });
			}
		}
	}, SESSION_CLEANUP_INTERVAL_MS);
	cleanupTimer.unref();

	return async (req: Request, res: Response): Promise<void> => {
		try {
			const sessionId = req.headers['mcp-session-id'] as string | undefined;

			// 已有 session：注入上下文并转发
			if (sessionId && sessions.has(sessionId)) {
				const entry = sessions.get(sessionId)!;
				entry.lastActivity = Date.now();
				const ctx: RequestContext = {
					requestId: crypto.randomUUID().slice(0, 8),
					sessionId,
					productId: config.product.id,
					clientInfo: entry.clientInfo,
					clientIp: req.ip || 'unknown',
				};
				await requestContext.run(ctx, () => entry.transport.handleRequest(req, res, req.body));
				return;
			}

			// 有 session ID 但不存在：返回 404，客户端应重新 initialize
			if (sessionId && !sessions.has(sessionId)) {
				jsonRpcError(res, 404, -32001, 'Session not found. Client must re-initialize.');
				return;
			}

			// 新 session：仅接受 initialize 请求
			if (!sessionId && isInitializeRequest(req.body)) {
				// 提取 clientInfo
				const rawClient = req.body?.params?.clientInfo;
				const clientInfo = rawClient?.name
					? { name: String(rawClient.name), version: String(rawClient.version ?? '') }
					: null;

				const transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => crypto.randomUUID(),
					enableJsonResponse: true,
					onsessioninitialized: (sid) => {
						sessions.set(sid, { transport, lastActivity: Date.now(), clientInfo });
						sessionLogger.info('Session created', {
							productId: config.product.id,
							sessionId: sid,
							client: clientInfo as unknown as Record<string, unknown>,
						});
					},
				});

				transport.onerror = (err) => sessionLogger.error('Transport error', {
					productId: config.product.id,
					error: err instanceof Error ? err.message : String(err),
				});
				transport.onclose = () => {
					const sid = transport.sessionId;
					if (sid) {
						sessions.delete(sid);
						sessionLogger.info('Session closed', { productId: config.product.id, sessionId: sid });
					}
				};

				const mcpServer = new MCPServer(config, searcher, version);
				await mcpServer.getServer().connect(transport);

				// initialize 请求也注入上下文
				const initCtx: RequestContext = {
					requestId: crypto.randomUUID().slice(0, 8),
					sessionId: transport.sessionId ?? '-',
					productId: config.product.id,
					clientInfo,
					clientIp: req.ip || 'unknown',
				};
				await requestContext.run(initCtx, () => transport.handleRequest(req, res, req.body));
				return;
			}

			// 无 session ID + 非 initialize 请求
			jsonRpcError(res, 400, -32600, 'Bad Request: Missing session ID or not an initialize request.');
		} catch (err) {
			sessionLogger.error('Request error', {
				productId: config.product.id,
				error: err instanceof Error ? err.message : String(err),
			});
			if (!res.headersSent) {
				jsonRpcError(res, 500, -32603, 'Internal server error');
			}
		}
	};
}

/**
 * 创建并启动 HTTP 服务，返回 { server, close } handle。
 * 不使用模块级单例，支持多实例并行（集成测试场景）。
 */
export async function startServer(
	products: ProductEntry[],
	port: number,
	host: string,
	version: string,
): Promise<ServerHandle> {
	const app = express();
	app.use(express.json());

	// CORS
	app.use((_req, res, next) => {
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
		res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
		if (_req.method === 'OPTIONS') {
			res.status(204).end();
			return;
		}
		next();
	});

	app.use((req, _res, next) => {
		httpLogger.debug(`${req.method} ${req.path}`);
		next();
	});

	// Health: 展示所有已注册产品
	app.get('/health', (_req: Request, res: Response): void => {
		res.json({
			status: 'ok',
			version,
			products: products.map((p) => ({
				id: p.config.product.id,
				name: p.config.product.name,
				lang: p.config.variant.lang,
				collection: p.config.variant.collection,
				endpoint: `/mcp/${p.config.product.id}`,
			})),
			timestamp: new Date().toISOString(),
		});
	});

	// 为每个产品注册独立的 MCP 端点
	for (const { config, searcher } of products) {
		const mcpPath = `/mcp/${config.product.id}`;
		const handler = createMcpHandler(config, searcher, version);

		app.post(mcpPath, handler);
		app.get(mcpPath, handler);
		app.delete(mcpPath, handler);

		httpLogger.info('MCP endpoint registered', { path: mcpPath });
	}

	// Accept 协商：text/markdown 返回结构化服务描述
	app.get('/', (req: Request, res: Response, next) => {
		if (!req.accepts('text/markdown')) {
			next();
			return;
		}
		const baseUrl = `${req.protocol}://${req.get('host')}`;
		const md = generateServiceMarkdown(products, baseUrl, version);
		res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
		res.setHeader('Vary', 'Accept');
		res.send(md);
	});

	// 静态前端（可选）：Docker 中为 /app/public，开发时为 cwd/public
	const publicDir = resolve(process.cwd(), 'public');
	if (existsSync(join(publicDir, 'index.html'))) {
		app.use(express.static(publicDir));

		// SPA fallback：非 API 路径的 GET 请求返回 index.html
		app.get('*', (req, res, next) => {
			if (req.path.startsWith('/mcp/') || req.path === '/health') {
				next();
				return;
			}
			res.sendFile(join(publicDir, 'index.html'));
		});
		httpLogger.info('Frontend enabled', { path: publicDir });
	}

	// 404
	app.use((_req, res) => {
		res.status(404).json({ error: 'Not found' });
	});

	// Listen
	const server = await new Promise<HttpServer>((resolve, reject) => {
		const s = app.listen(port, host, () => {
			httpLogger.info('Server listening', { url: `http://${host}:${port}` });
			resolve(s);
		});
		s.on('error', reject);
	});

	const close = async (): Promise<void> => {
		await new Promise<void>((resolve, reject) => {
			server.close((err) => {
				if (err) reject(err);
				else {
					httpLogger.info('Server stopped');
					resolve();
				}
			});
		});
	};

	return { server, close };
}
