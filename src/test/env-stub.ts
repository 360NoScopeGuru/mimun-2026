/**
 * Test-only stand-in for SvelteKit's `$env/dynamic/private`, which the plain
 * Vitest (node) config can't resolve because there's no SvelteKit build context.
 * Aliased in `vitest.config.ts`. The real `env` is only read lazily inside
 * functions, so an empty record is enough to let pure modules import cleanly.
 */
export const env: Record<string, string | undefined> = {};
