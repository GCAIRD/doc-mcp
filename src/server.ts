/**
 * HTTP Server for GC-DOC-MCP v2
 *
 * Express + MCP Streamable HTTP endpoint (multi-product)
 */

import express from 'express';
import type { Request, Response } from 'express';
import type { Server as HttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedConfig } from './config/index.js';
import type { ISearcher } from './rag/types.js';
import { MCPServer } from './mcp/server.js';
import { createDefaultLogger } from './shared/logger.js';
import { requestContext, type RequestContext } from './shared/request-context.js';

const logger = createDefaultLogger('HTTP');

/** Session 超时时间：30 分钟 */
const SESSION_TTL_MS = 30 * 60 * 1000;
/** Session 清理扫描间隔：5 分钟 */
const SESSION_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export interface ProductEntry {
	config: ResolvedConfig;
	searcher: ISearcher;
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
				logger.info('Session expired', { productId: config.product.id, sessionId: sid });
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
						logger.info('MCP session created', {
							productId: config.product.id,
							sessionId: sid,
							client: clientInfo as unknown as Record<string, unknown>,
						});
					},
				});

				transport.onerror = (err) => logger.error('MCP transport error', {
					productId: config.product.id,
					error: err instanceof Error ? err.message : String(err),
				});
				transport.onclose = () => {
					const sid = transport.sessionId;
					if (sid) {
						sessions.delete(sid);
						logger.info('MCP session closed', { productId: config.product.id, sessionId: sid });
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
			logger.error('MCP request error', {
				productId: config.product.id,
				error: err instanceof Error ? err.message : String(err),
			});
			if (!res.headersSent) {
				jsonRpcError(res, 500, -32603, 'Internal server error');
			}
		}
	};
}

let httpServer: HttpServer | null = null;

/**
 * Start HTTP server with MCP endpoints for all products
 */
export async function startServer(
	products: ProductEntry[],
	port: number,
	host: string,
	version: string,
): Promise<HttpServer> {
	if (httpServer) {
		throw new Error('Server already running');
	}

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
		logger.debug(`${req.method} ${req.path}`);
		next();
	});

	// Health: 展示所有已注册产品
	app.get('/health', (_req: Request, res: Response): void => {
		res.json({
			status: 'ok',
			products: products.map((p) => ({
				id: p.config.product.id,
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

		logger.info('MCP endpoint registered', { path: mcpPath });
	}

	// 404
	app.use((_req, res) => {
		res.status(404).json({ error: 'Not found' });
	});

	// Listen
	await new Promise<void>((resolve, reject) => {
		const server = app.listen(port, host, () => {
			logger.info('Server listening', { url: `http://${host}:${port}` });
			resolve();
		});
		server.on('error', reject);
		httpServer = server;
	});

	return httpServer!;
}

/**
 * Stop HTTP server
 */
export async function stopServer(): Promise<void> {
	if (!httpServer) return;

	await new Promise<void>((resolve, reject) => {
		httpServer!.close((err) => {
			if (err) reject(err);
			else {
				logger.info('Server stopped');
				resolve();
			}
		});
	});

	httpServer = null;
}
