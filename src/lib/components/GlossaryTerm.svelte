<script lang="ts">
	// Inline jargon term: dashed underline, reveals a plain-English definition on
	// hover (desktop) or tap (touch). Falls back to plain text if the term is unknown.
	import type { Snippet } from 'svelte';
	import { GLOSSARY } from '$lib/glossary';

	let { term, children }: { term: string; children: Snippet } = $props();
	const def = $derived(GLOSSARY[term] ?? '');
	let open = $state(false);
</script>

<span class="gt">
	<button
		type="button"
		class="gt-term"
		onclick={() => (open = !open)}
		onmouseenter={() => (open = true)}
		onmouseleave={() => (open = false)}
		onblur={() => (open = false)}
	>{@render children()}</button>
	{#if open && def}
		<span class="gt-pop" role="tooltip">{def}</span>
	{/if}
</span>

<style>
	.gt {
		position: relative;
		display: inline-block;
	}
	.gt-term {
		border: 0;
		margin: 0;
		padding: 0;
		font: inherit;
		color: inherit;
		cursor: help;
		border-bottom: 1px dashed currentColor;
	}
	.gt-pop {
		position: absolute;
		left: 0;
		top: calc(100% + 5px);
		z-index: 40;
		width: max-content;
		max-width: 15rem;
		border-radius: 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: var(--color-ink-800);
		color: var(--color-ink-100);
		padding: 0.5rem 0.7rem;
		font-size: 0.72rem;
		font-weight: 400;
		line-height: 1.45;
		letter-spacing: normal;
		text-transform: none;
		box-shadow: 0 12px 28px -12px rgba(0, 0, 0, 0.85);
	}
</style>
