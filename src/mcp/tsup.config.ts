import { defineConfig } from 'tsup';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	platform: 'node',
	target: 'node20',
	outDir: 'dist',
	clean: true,
	noExternal: [/.*/],
	define: {
		APP_VERSION: JSON.stringify(pkg.version),
	},
	banner: {
		js: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
	},
});
