import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Pure unit tests for server logic (procedure engine, AI prompt builders, etc.).
// Kept separate from the SvelteKit Vite config so node tests don't pull in
// the full app/build pipeline.
export default defineConfig({
	resolve: {
		alias: {
			// `$env/dynamic/private` has no value outside a SvelteKit build; the
			// real env is read lazily inside functions, so a stub lets pure modules
			// (e.g. aiFeatures' prompt builders) be imported and tested directly.
			'$env/dynamic/private': fileURLToPath(new URL('./src/test/env-stub.ts', import.meta.url))
		}
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
