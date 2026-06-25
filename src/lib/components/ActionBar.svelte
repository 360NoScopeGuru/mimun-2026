<script lang="ts">
	// Persistent bottom action bar for touch/mobile. The room hides it at ≥lg
	// (where the dais rail is always visible) via a wrapper class. Renders its
	// buttons through a snippet so callers control the actions.
	import type { Snippet } from 'svelte';
	let { children }: { children?: Snippet } = $props();
</script>

<div class="action-bar">
	{@render children?.()}
</div>

<style>
	.action-bar {
		position: sticky;
		bottom: 0;
		z-index: 30;
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 0.4rem;
		padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom));
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		background: linear-gradient(180deg, rgba(13, 19, 34, 0.82), var(--color-ink-900));
		backdrop-filter: blur(8px);
	}
</style>
