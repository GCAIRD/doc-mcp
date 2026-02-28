/**
 * @gc-doc/shared — 公共模块统一导出
 */

// Config
export * from './config/index.js';

// Utilities
export { Logger, LogLevel, createDefaultLogger, getLogLevelFromEnv } from './logger.js';
export type { LoggerOptions } from './logger.js';

export { ConfigError, SearchError, ApiError, RateLimitError } from './errors.js';

export { RateLimiter, createVoyageRateLimiter } from './rate-limiter.js';
export type { RateLimiterConfig } from './rate-limiter.js';

// RAG primitives
export { QdrantClient, BM25_MODEL, stringToUuid } from './qdrant-client.js';
export type { UpsertPoint, QdrantSearchResult, QdrantScrollResult } from './qdrant-client.js';

export { VoyageEmbedder, createVoyageEmbedder } from './embedder.js';
export type { EmbedderConfig, EmbedResult, CreateVoyageEmbedderOptions } from './embedder.js';
