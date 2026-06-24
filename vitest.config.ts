import { defineConfig } from 'vitest/config';

// Pure unit tests for server logic (procedure engine, etc.).
// Kept separate from the SvelteKit Vite config so node tests don't pull in
// the full app/build pipeline.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
