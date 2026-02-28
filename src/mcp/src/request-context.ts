/**
 * 请求上下文 — 通过 AsyncLocalStorage 传递 session/client 信息到 tool handler
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
	requestId: string;
	sessionId: string;
	productId: string;
	clientInfo: { name: string; version: string } | null;
	clientIp: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
