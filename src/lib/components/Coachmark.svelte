<script lang="ts">
	// First-run welcome card shown over the room. Centered, dismissed with "Got it"
	// (the caller persists that so it only shows once).
	import type { Snippet } from 'svelte';
	let { title = 'Welcome', children, ondismiss }: { title?: string; children: Snippet; ondismiss: () => void } = $props();
</script>

<div class="cm-root" role="dialog" aria-modal="true" aria-label={title}>
	<div class="cm-card">
		<p class="label label-brass">{title}</p>
		<div class="mt-3 space-y-2 text-sm leading-relaxed text-ink-200">{@render children()}</div>
		<button type="button" class="btn btn-brass focus-ring mt-5 w-full" onclick={ondismiss}>Got it — let’s go</button>
	</div>
</div>

<style>
	.cm-root {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		background: rgba(3, 6, 14, 0.66);
		backdrop-filter: blur(3px);
		animation: cm-fade 0.24s ease;
	}
	.cm-card {
		width: 100%;
		max-width: 26rem;
		border-radius: 1rem;
		border: 1px solid rgba(205, 168, 92, 0.22);
		background: linear-gradient(180deg, var(--color-ink-700), var(--color-ink-850));
		box-shadow: 0 30px 60px -24px rgba(0, 0, 0, 0.9);
		padding: 1.5rem;
		animation: cm-rise 0.34s cubic-bezier(0.22, 1, 0.36, 1);
	}

	@keyframes cm-fade {
		from {
			opacity: 0;
		}
	}
	@keyframes cm-rise {
		from {
			transform: translateY(10px) scale(0.97);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cm-root,
		.cm-card {
			animation: none;
		}
	}
</style>
