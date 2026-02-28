/**
 * 结构化日志模块
 *
 * TTY 模式：彩色可读格式 + JSON 附加字段
 * 非 TTY 模式（Docker/CI）：JSON Lines
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

const isTTY = process.stdout.isTTY === true;

function colorize(text: string, colorCode: number): string {
	return `\x1b[${colorCode}m${text}\x1b[0m`;
}

/**
 * 日志类 — 支持 TTY 彩色输出 / 非 TTY JSON Lines
 */
export class Logger {
	private level: LogLevel;
	private prefix: string;

	constructor(options: LoggerOptions = {}) {
		this.level = options.level ?? LogLevel.INFO;
		this.prefix = options.prefix ?? '';
	}

	/** 创建带前缀的子 logger */
	withPrefix(prefix: string): Logger {
		return new Logger({
			level: this.level,
			prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
		});
	}

	/** 设置日志级别 */
	setLevel(level: LogLevel): void {
		this.level = level;
	}

	private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
		if (level < this.level) return;

		const ts = new Date().toISOString();
		const levelName = LEVEL_NAMES[level];
		const stream = level >= LogLevel.ERROR ? process.stderr : process.stdout;

		if (isTTY) {
			const prefix = this.prefix ? `[${this.prefix}] ` : '';
			const colored = colorize(levelName.padEnd(5), LEVEL_COLORS[level]);
			const extra = data && Object.keys(data).length > 0
				? ' ' + JSON.stringify(data)
				: '';
			stream.write(`${ts} ${colored} ${prefix}${message}${extra}\n`);
		} else {
			const entry: Record<string, unknown> = {
				ts,
				level: levelName,
				...(this.prefix ? { module: this.prefix } : {}),
				msg: message,
				...data,
			};
			stream.write(JSON.stringify(entry) + '\n');
		}
	}

	debug(message: string, data?: Record<string, unknown>): void {
		this.log(LogLevel.DEBUG, message, data);
	}

	info(message: string, data?: Record<string, unknown>): void {
		this.log(LogLevel.INFO, message, data);
	}

	warn(message: string, data?: Record<string, unknown>): void {
		this.log(LogLevel.WARN, message, data);
	}

	error(message: string, data?: Record<string, unknown>): void {
		this.log(LogLevel.ERROR, message, data);
	}
}

/** 从环境变量读取日志级别 */
export function getLogLevelFromEnv(): LogLevel {
	const levelStr = process.env.LOG_LEVEL?.toUpperCase();
	switch (levelStr) {
		case 'DEBUG': return LogLevel.DEBUG;
		case 'INFO':  return LogLevel.INFO;
		case 'WARN':  return LogLevel.WARN;
		case 'ERROR': return LogLevel.ERROR;
		default:      return LogLevel.INFO;
	}
}

/** 创建默认 logger（从环境变量读取级别） */
export function createDefaultLogger(prefix?: string): Logger {
	return new Logger({
		level: getLogLevelFromEnv(),
		prefix,
	});
}
