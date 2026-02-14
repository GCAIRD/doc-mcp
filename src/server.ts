/**
 * HTTP Server for GC-DOC-MCP v2
 *
 * Express + MCP Streamable HTTP endpoint
 */

import express from 'express';
import type { Request, Response, RequestHandler } from 'express';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Server as HttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { ResolvedConfig } from './config/index.js';
import type { ISearcher } from './rag/types.js';
import { createMCPServer } from './mcp/server.js';
import { createDefaultLogger } from './shared/logger.js';

const logger = createDefaultLogger('HTTP');

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TUTORIAL_DIST = join(__dirname, '../tutorial/dist');

function createHealthHandler(config: ResolvedConfig): RequestHandler {
	return (_req: Request, res: Response): void => {
		res.json({
			status: 'ok',
			product: config.product.id,
			lang: config.variant.lang,
			collection: config.variant.collection,
			timestamp: new Date().toISOString(),
		});
	};
}

function serveTutorial(page: 'index' | 'playground'): RequestHandler {
	return (_req: Request, res: Response): void => {
		const fileName = page === 'index' ? 'index.html' : 'playground.html';
		res.sendFile(join(TUTORIAL_DIST, fileName), (err) => {
			if (err) {
				logger.warn(`Tutorial page not found: ${fileName}`);
				res.status(404).json({ error: 'Tutorial page not found', page });
			}
		});
	};
}

let httpServer: HttpServer | null = null;

/**
 * Start HTTP server with MCP
 */
export async function startServer(
	config: ResolvedConfig,
	searcher: ISearcher,
	port: number,
	host: string,
): Promise<HttpServer> {
	if (httpServer) {
		throw new Error('Server already running');
	}

	// Per-session transport management (每个 MCP 客户端一个独立 session)
	const sessions = new Map<string, StreamableHTTPServerTransport>();

	// 创建 Express app
	const app = express();
	app.use(express.json());

	app.use((req, _res, next) => {
		logger.debug(`${req.method} ${req.path}`);
		next();
	});

	// Routes
	app.get('/', serveTutorial('index'));
	app.get('/playground', serveTutorial('playground'));
	app.get('/health', createHealthHandler(config));

	// MCP Streamable HTTP endpoint: /mcp/${product}
	const mcpPath = `/mcp/${config.product.id}`;

	const mcpHandler = async (req: Request, res: Response): Promise<void> => {
		try {
			const sessionId = req.headers['mcp-session-id'] as string | undefined;

			if (sessionId && sessions.has(sessionId)) {
				// 已有 session，复用 transport
				await sessions.get(sessionId)!.handleRequest(req, res, req.body);
				return;
			}

			if (!sessionId && isInitializeRequest(req.body)) {
				// 新 session: 创建独立 transport + MCP server
				const transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => crypto.randomUUID(),
					enableJsonResponse: true,
					onsessioninitialized: (sid) => {
						sessions.set(sid, transport);
						logger.info(`MCP session created: ${sid}`);
					},
				});

				transport.onerror = (err) => logger.error('MCP transport error', err);
				transport.onclose = () => {
					const sid = transport.sessionId;
					if (sid) {
						sessions.delete(sid);
						logger.info(`MCP session closed: ${sid}`);
					}
				};

				const mcpServer = await createMCPServer(config, searcher);
				await mcpServer.getServer().connect(transport);
				await transport.handleRequest(req, res, req.body);
				return;
			}

			// 无效请求
			res.status(400).json({
				jsonrpc: '2.0',
				error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
				id: null,
			});
		} catch (err) {
			logger.error('MCP request error', err);
			if (!res.headersSent) {
				res.status(500).json({ error: 'Internal server error' });
			}
		}
	};

	app.post(mcpPath, mcpHandler);
	app.get(mcpPath, mcpHandler);
	app.delete(mcpPath, mcpHandler);

	// Static assets
	app.use(express.static(TUTORIAL_DIST, { index: false }));

	// 404
	app.use((_req, res) => {
		res.status(404).json({ error: 'Not found' });
	});

	// Listen
	await new Promise<void>((resolve, reject) => {
		const server = app.listen(port, host, () => {
			logger.info(`Server listening on http://${host}:${port}`);
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
