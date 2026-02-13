/**
 * 共享错误类型
 *
 * 自定义错误类，便于统一处理和类型区分
 */

/**
 * 配置相关错误
 */
export class ConfigError extends Error {
	constructor(message: string, public readonly cause?: Error) {
		super(message);
		this.name = 'ConfigError';
		Error.captureStackTrace?.(this, ConfigError);
	}
}

/**
 * 搜索相关错误
 */
export class SearchError extends Error {
	constructor(message: string, public readonly cause?: Error) {
		super(message);
		this.name = 'SearchError';
		Error.captureStackTrace?.(this, SearchError);
	}
}

/**
 * API 调用相关错误
 */
export class ApiError extends Error {
	constructor(
		message: string,
		public readonly statusCode?: number,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = 'ApiError';
		Error.captureStackTrace?.(this, ApiError);
	}
}

/**
 * 限流错误
 */
export class RateLimitError extends Error {
	constructor(
		message: string,
		public readonly retryAfter?: number,
	) {
		super(message);
		this.name = 'RateLimitError';
		Error.captureStackTrace?.(this, RateLimitError);
	}
}
