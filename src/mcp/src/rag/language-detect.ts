/**
 * 语言检测模块
 *
 * 使用 franc 包进行语言检测，支持中文、英文、日文
 */

import { franc } from 'franc';
import type { Language } from '@gc-doc/shared';

/** franc 对短文本检测不准确的最小长度阈值 */
const MIN_DETECTION_LENGTH = 10;

/** franc 语言代码 → Language 映射 */
const LANG_MAP: Record<string, Language> = {
	// 中文简体
	zho: 'zh',
	cmn: 'zh',
	lzh: 'zh',
	// 英文
	eng: 'en',
	// 日文
	jpn: 'ja',
};

/**
 * 检测文本语言
 *
 * @param text - 要检测的文本
 * @param fallback - 无法检测时的默认语言
 * @returns 检测到的语言代码
 */
export function detectLanguage(text: string, fallback: Language = 'en'): Language {
	if (!text || text.trim().length === 0) {
		return fallback;
	}

	// franc 对短文本检测不准确，设置最小长度
	if (text.trim().length < MIN_DETECTION_LENGTH) {
		return fallback;
	}

	try {
		const langCode = franc(text);
		const detected = LANG_MAP[langCode];

		if (detected) {
			return detected;
		}

		return fallback;
	} catch {
		return fallback;
	}
}

/** 批量检测语言（返回最频繁的语言） */
export function detectBatchLanguage(texts: string[], fallback: Language = 'en'): Language {
	const counts: Record<Language, number> = { zh: 0, en: 0, ja: 0 };

	for (const text of texts) {
		const lang = detectLanguage(text, fallback);
		counts[lang]++;
	}

	// 返回出现最多的语言
	return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as Language) ?? fallback;
}
