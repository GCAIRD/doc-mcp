/**
 * 限流器
 *
 * 使用滑动窗口算法实现 RPM 和 TPM 限制
 * 用于 Voyage API 等有调用配额的服务
 */

import { RateLimitError } from './errors.js';
import { Logger, LogLevel } from './logger.js';

export interface RateLimiterConfig {
	/** 每分钟请求数限制 */
	requestsPerMinute: number;
	/** 每分钟 token 数限制 */
	tokensPerMinute: number;
	/** 窗口大小（毫秒），默认 60 秒 */
	windowMs?: number;
	/** 日志器 */
	logger?: Logger;
}

/**
 * 滑动窗口计数器（支持带权重的计数，用于 TPM 统计）
 */
class SlidingWindow {
	readonly windowMs: number;
	private entries: Array<{ timestamp: number; weight: number }> = [];

	constructor(windowMs: number = 60_000) {
		this.windowMs = windowMs;
	}

	private cleanup(now: number): void {
		const cutoff = now - this.windowMs;
		this.entries = this.entries.filter(e => e.timestamp > cutoff);
	}

	/**
	 * 添加带权重的条目，返回添加后的总权重
	 */
	tryAdd(weight: number = 1): number {
		const now = Date.now();
		this.cleanup(now);
		this.entries.push({ timestamp: now, weight });
		return this.entries.reduce((sum, e) => sum + e.weight, 0);
	}

	/**
	 * 获取窗口内总权重
	 */
	getCount(): number {
		const now = Date.now();
		this.cleanup(now);
		return this.entries.reduce((sum, e) => sum + e.weight, 0);
	}

	/**
	 * 获取窗口内最早的时间戳
	 */
	getEarliestTimestamp(): number | undefined {
		const now = Date.now();
		this.cleanup(now);
		return this.entries[0]?.timestamp;
	}
}

/**
 * 限流器
 */
export class RateLimiter {
	private readonly rpm: SlidingWindow;
	private readonly tpm: SlidingWindow;
	private readonly rpmLimit: number;
	private readonly tpmLimit: number;
	private readonly logger: Logger;

	constructor(config: RateLimiterConfig) {
		this.rpmLimit = config.requestsPerMinute;
		this.tpmLimit = config.tokensPerMinute;
		this.rpm = new SlidingWindow(config.windowMs);
		this.tpm = new SlidingWindow(config.windowMs);
		this.logger = config.logger ?? new Logger({ level: LogLevel.ERROR });
	}

	/**
	 * 检查是否允许请求
	 *
	 * @param tokenCount - 本次请求的 token 数
	 * @throws RateLimitError 如果超过限制
	 */
	check(tokenCount: number): void {
		const currentRpm = this.rpm.getCount();
		const currentTpm = this.tpm.getCount();

		if (currentRpm >= this.rpmLimit) {
			const retryAfter = this.getRetryAfter(this.rpm);
			throw new RateLimitError(
				`Rate limit exceeded: ${currentRpm}/${this.rpmLimit} requests per minute`,
				retryAfter,
			);
		}

		if (currentTpm + tokenCount > this.tpmLimit) {
			const retryAfter = this.getRetryAfter(this.tpm);
			throw new RateLimitError(
				`Rate limit exceeded: ${currentTpm + tokenCount}/${this.tpmLimit} tokens per minute`,
				retryAfter,
			);
		}

		this.logger.debug(
			`RateLimiter: ${currentRpm}/${this.rpmLimit} RPM, ${currentTpm}/${this.tpmLimit} TPM`,
		);
	}

	/**
	 * 记录一次请求
	 *
	 * @param tokenCount - 本次请求的 token 数
	 */
	record(tokenCount: number): void {
		this.rpm.tryAdd(1);
		this.tpm.tryAdd(tokenCount);
	}

	/**
	 * 检查并记录（原子操作）
	 *
	 * @param tokenCount - 本次请求的 token 数
	 * @throws RateLimitError 如果超过限制
	 */
	checkAndRecord(tokenCount: number): void {
		this.check(tokenCount);
		this.record(tokenCount);
	}

	/**
	 * 获取距离窗口重置的等待时间（秒）
	 */
	private getRetryAfter(window: SlidingWindow): number {
		const earliest = window.getEarliestTimestamp();
		if (!earliest) {
			return 0;
		}
		const waitMs = earliest + window.windowMs - Date.now();
		return Math.max(0, Math.ceil(waitMs / 1000));
	}

	/**
	 * 获取当前使用情况
	 */
	getStats(): { rpm: number; tpm: number } {
		return {
			rpm: this.rpm.getCount(),
			tpm: this.tpm.getCount(),
		};
	}
}

/**
 * 创建 Voyage API 限流器
 *
 * Voyage 免费版限制：RPM 限制因模型而异
 * 见：https://docs.voyageai.com/docs/rate-limits
 */
export function createVoyageRateLimiter(
	requestsPerMinute: number,
	tokensPerMinute: number,
	logger?: Logger,
): RateLimiter {
	return new RateLimiter({
		requestsPerMinute,
		tokensPerMinute,
		logger,
	});
}
