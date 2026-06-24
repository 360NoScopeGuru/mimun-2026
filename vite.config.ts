import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Pin serverless functions to Frankfurt (fra1) to sit next to the Neon
			// database in eu-central-1 — eliminates a trans-Atlantic hop per query
			// and is also the closest region to delegates in the Gulf.
			adapter: adapter({ regions: ['fra1'] })
		})
	]
});
