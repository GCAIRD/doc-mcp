/**
 * 简单日志模块
 *
 * 支持多级别日志输出，格式化时间戳
 */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

export interface LoggerOptions {
	level?: LogLevel;
	prefix?: string;
}

const LEVEL_NAMES: Record<LogLevel, string> = {
	[LogLevel.DEBUG]: 'DEBUG',
	[LogLevel.INFO]: 'INFO',
	[LogLevel.WARN]: 'WARN',
	[LogLevel.ERROR]: 'ERROR',
};

const LEVEL_COLORS: Record<LogLevel, number> = {
	[LogLevel.DEBUG]: 90,  // 灰色
	[LogLevel.INFO]:  36,  // 青色
	[LogLevel.WARN]:  33,  // 黄色
	[LogLevel.ERROR]: 31,  // 红色
};

/**
 * 格式化时间戳
 */
function formatTimestamp(): string {
	return new Date().toISOString();
}

/**
 * 着色输出（仅支持终端）
 */
function colorize(text: string, colorCode: number): string {
	if (process.stdout.isTTY) {
		return `\x1b[${colorCode}m${text}\x1b[0m`;
	}
	return text;
}

/**
 * 日志类
 */
export class Logger {
	private level: LogLevel;
	private prefix: string;

	constructor(options: LoggerOptions = {}) {
		this.level = options.level ?? LogLevel.INFO;
		this.prefix = options.prefix ?? '';
	}

	/**
	 * 创建带前缀的子 logger
	 */
	withPrefix(prefix: string): Logger {
		return new Logger({
			level: this.level,
			prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
		});
	}

	/**
	 * 设置日志级别
	 */
	setLevel(level: LogLevel): void {
		this.level = level;
	}

	/**
	 * 核心日志方法
	 */
	private log(level: LogLevel, message: string, ...args: unknown[]): void {
		if (level < this.level) {
			return;
		}

		const levelName = LEVEL_NAMES[level];
		const timestamp = formatTimestamp();
		const prefix = this.prefix ? `[${this.prefix}] ` : '';

		const formattedMessage = `${timestamp} ${colorize(levelName.padEnd(5), LEVEL_COLORS[level])} ${prefix}${message}`;

		// 使用 console 对应方法
		const consoleMethod = level === LogLevel.ERROR ? console.error :
		                      level === LogLevel.WARN ? console.warn :
		                      console.log;

		consoleMethod(formattedMessage, ...args);
	}

	debug(message: string, ...args: unknown[]): void {
		this.log(LogLevel.DEBUG, message, ...args);
	}

	info(message: string, ...args: unknown[]): void {
		this.log(LogLevel.INFO, message, ...args);
	}

	warn(message: string, ...args: unknown[]): void {
		this.log(LogLevel.WARN, message, ...args);
	}

	error(message: string, ...args: unknown[]): void {
		this.log(LogLevel.ERROR, message, ...args);
	}
}

/**
 * 从环境变量读取日志级别
 */
export function getLogLevelFromEnv(): LogLevel {
	const levelStr = process.env.LOG_LEVEL?.toUpperCase();
	switch (levelStr) {
		case 'DEBUG':
			return LogLevel.DEBUG;
		case 'INFO':
			return LogLevel.INFO;
		case 'WARN':
			return LogLevel.WARN;
		case 'ERROR':
			return LogLevel.ERROR;
		default:
			return LogLevel.INFO;
	}
}

/**
 * 创建默认 logger（从环境变量读取级别）
 */
export function createDefaultLogger(prefix?: string): Logger {
	return new Logger({
		level: getLogLevelFromEnv(),
		prefix,
	});
}
