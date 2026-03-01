/**
 * MCP Tool Response Types
 *
 * 定义每个 tool 返回给 LLM 的 JSON 结构（即 content[0].text 里的内容）。
 * 作为对外契约，变更需同步更新测试和文档。
 */

import type { SearchResult } from '../../rag/types.js';

/** search tool 返回结构 */
export interface SearchToolResponse {
	query: string;
	results: SearchResult[];
	search_time_ms: number;
	rerank_used: boolean;
	fusion_mode: 'rrf' | 'dense_only';
	detected_lang: string;
	doc_language: string;
	next_step: string;
}

/** fetch tool 返回结构 */
export interface FetchToolResponse {
	doc_id: string;
	chunk_count: number;
	full_content: string;
	next_step: string;
}

/** get_code_guidelines 单个资源 */
export interface GuidelineEntry {
	name: string;
	description: string;
	content: string;
}

/** get_code_guidelines tool 返回结构 */
export interface GuidelinesToolResponse {
	guidelines: Record<string, GuidelineEntry>;
}
