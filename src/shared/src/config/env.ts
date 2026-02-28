/**
 * Environment variable schema and validation using zod
 */

import { z } from 'zod';

/**
 * Environment variable schema
 */
export const envSchema = z.object({
	// === Product Selection ===
	PRODUCT: z.string().min(1, 'PRODUCT is required'),
	DOC_LANG: z.string().min(1).default('en'),

	// === Server ===
	PORT: z.coerce.number().int().positive().default(8900),
	HOST: z.string().default('0.0.0.0'),

	// === Voyage AI ===
	VOYAGE_API_KEY: z.string().min(1, 'VOYAGE_API_KEY is required'),
	VOYAGE_EMBED_MODEL: z.string().default('voyage-code-3'),
	VOYAGE_RERANK_MODEL: z.string().default('rerank-2.5'),
	VOYAGE_RPM_LIMIT: z.coerce.number().int().positive().default(2000),
	VOYAGE_TPM_LIMIT: z.coerce.number().int().positive().default(3000000),

	// === Qdrant ===
	QDRANT_URL: z.string().url('QDRANT_URL must be a valid URL').default('http://localhost:6333'),
	QDRANT_API_KEY: z.string().optional(),

	// === Embedding ===
	CHUNK_SIZE: z.coerce.number().int().positive().default(3000),
	BATCH_SIZE: z.coerce.number().int().positive().default(128),

	// === Logging ===
	LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/**
 * Parsed environment variables
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Cached parsed environment
 */
let cachedEnv: Env | null = null;

/**
 * Parse and validate environment variables
 */
export function parseEnv(env: Record<string, string | undefined> = process.env): Env {
	if (cachedEnv) {
		return cachedEnv;
	}

	const result = envSchema.safeParse(env);

	if (!result.success) {
		const errors = result.error.errors
			.map((e) => `  ${e.path.join('.')}: ${e.message}`)
			.join('\n');
		throw new Error(`Environment validation failed:\n${errors}`);
	}

	cachedEnv = result.data;
	return cachedEnv;
}

/**
 * Get current environment (uses process.env)
 */
export function getEnv(): Env {
	return parseEnv();
}

/**
 * Clear cached environment (for testing)
 */
export function clearEnvCache(): void {
	cachedEnv = null;
}
