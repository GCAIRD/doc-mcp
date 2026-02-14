/**
 * Configuration loader for GC-DOC-MCP v2
 * Loads product and variant YAML files and merges them into ResolvedConfig
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { getEnv } from './env.js';
import type {
	ResolvedConfig,
	ProductConfig,
	VariantConfig,
	VariantYaml,
	SearchConfig,
} from './types.js';
import { productYamlSchema, variantYamlSchema } from './types.js';
import { ConfigError } from '../shared/errors.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../..');
const PRODUCTS_DIR = join(PROJECT_ROOT, 'products');

/** SearchConfig 默认值 */
const DEFAULT_SEARCH_CONFIG: SearchConfig = {
	prefetch_limit: 20,
	rerank_top_k: 10,
	default_limit: 5,
	dense_score_threshold: 0.3,
};

/**
 * Load a YAML file and validate against a zod schema
 */
async function loadAndValidateYaml<T>(filePath: string, schema: z.ZodType<T>): Promise<T> {
	const content = await readFile(filePath, 'utf-8');
	const raw = parseYaml(content);
	const result = schema.safeParse(raw);
	if (!result.success) {
		throw new ConfigError(`Invalid config ${filePath}: ${result.error.message}`);
	}
	return result.data;
}

/**
 * Normalize variant config (fill defaults from YAML)
 */
function normalizeVariant(
	raw: VariantYaml,
	productId: string,
): VariantConfig {
	return {
		lang: raw.lang,
		company: raw.company,
		company_short: raw.company_short ?? raw.company.substring(0, 2).toUpperCase(),
		doc_language: raw.doc_language,
		collection: raw.collection ?? `${productId}_${raw.lang}`,
		raw_data: raw.raw_data,
		npm_scope: raw.npm_scope,
		cdn_domain: raw.cdn_domain,
		description: raw.description,
		resources: raw.resources ?? {},
	};
}

/**
 * Config cache (keyed by product/lang)
 */
const configCache = new Map<string, ResolvedConfig>();

/**
 * Load configuration for a product and language variant
 */
export async function loadConfig(
	productId: string,
	lang: string,
): Promise<ResolvedConfig> {
	const cacheKey = `${productId}/${lang}`;
	const cached = configCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const productPath = join(PRODUCTS_DIR, productId, 'product.yaml');
	const variantPath = join(PRODUCTS_DIR, productId, `${lang}.yaml`);

	const [productRaw, variantRaw] = await Promise.all([
		loadAndValidateYaml(productPath, productYamlSchema),
		loadAndValidateYaml(variantPath, variantYamlSchema),
	]);

	const product: ProductConfig = {
		...productRaw,
		search: { ...DEFAULT_SEARCH_CONFIG, ...productRaw.search },
	};

	const variant = normalizeVariant(variantRaw, productId);

	const config: ResolvedConfig = { product, variant };
	configCache.set(cacheKey, config);
	return config;
}

/**
 * Get or load configuration from validated environment variables
 */
export async function getConfig(): Promise<ResolvedConfig> {
	const env = getEnv();
	return loadConfig(env.PRODUCT, env.DOC_LANG);
}

/**
 * Clear cached configuration (for testing)
 */
export function clearCache(): void {
	configCache.clear();
}

/**
 * Get products directory path
 */
export function getProductsDir(): string {
	return PRODUCTS_DIR;
}

/**
 * Get project root path
 */
export function getProjectRoot(): string {
	return PROJECT_ROOT;
}

/**
 * Read version from package.json (single source of truth, cached)
 */
let cachedVersion: string | null = null;

export async function getVersion(): Promise<string> {
	if (cachedVersion) return cachedVersion;

	const pkgPath = join(PROJECT_ROOT, 'package.json');
	const pkgContent = await readFile(pkgPath, 'utf-8');
	const pkg = JSON.parse(pkgContent);
	if (!pkg.version) {
		throw new Error('Missing "version" field in package.json');
	}
	cachedVersion = pkg.version as string;
	return cachedVersion;
}

/** 列出可用的产品目录 */
export async function listProducts(): Promise<string[]> {
	const entries = await readdir(PRODUCTS_DIR, { withFileTypes: true });
	return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/** 列出指定产品的可用语言 */
export async function listLanguages(productId: string): Promise<string[]> {
	const productDir = join(PRODUCTS_DIR, productId);
	const entries = await readdir(productDir);
	return entries
		.filter((e) => e.endsWith('.yaml') && e !== 'product.yaml')
		.map((e) => e.replace('.yaml', ''));
}
