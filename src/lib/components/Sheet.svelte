<script lang="ts">
	// Dependency-free bottom-sheet / drawer. Bottom sheet on phones, centered
	// dialog on ≥sm. Backdrop + Esc to close, focus moves in and returns out,
	// body scroll locked while open. Honors prefers-reduced-motion via CSS.
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title = '',
		children
	}: { open?: boolean; title?: string; children?: Snippet } = $props();

	let panel = $state<HTMLDivElement | null>(null);

	function close() {
		open = false;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}

	$effect(() => {
		if (!open) return;
		const lastFocused = document.activeElement as HTMLElement | null;
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		queueMicrotask(() => panel?.focus());
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('keydown', onKey);
			document.body.style.overflow = prevOverflow;
			lastFocused?.focus?.();
		};
	});
</script>

{#if open}
	<div class="sheet-root">
		<button type="button" class="sheet-backdrop" aria-label="Close" onclick={close}></button>
		<div class="sheet-panel" bind:this={panel} role="dialog" aria-modal="true" aria-label={title || 'Panel'} tabindex="-1">
			<div class="sheet-grip" aria-hidden="true"></div>
			<div class="sheet-head">
				{#if title}<p class="label label-brass">{title}</p>{/if}
				<button type="button" class="sheet-x focus-ring" onclick={close} aria-label="Close">✕</button>
			</div>
			<div class="sheet-body">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}

<style>
	.sheet-root {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
	}
	.sheet-backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		cursor: pointer;
		background: rgba(3, 6, 14, 0.62);
		backdrop-filter: blur(2px);
		animation: sheet-fade 0.2s ease;
	}
	.sheet-panel {
		position: relative;
		max-height: 86vh;
		overflow-y: auto;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-bottom: 0;
		border-radius: 1.25rem 1.25rem 0 0;
		background: linear-gradient(180deg, var(--color-ink-800), var(--color-ink-900));
		box-shadow: 0 -24px 60px -20px rgba(0, 0, 0, 0.9);
		padding: 0.5rem 1.1rem calc(1.4rem + env(safe-area-inset-bottom));
		outline: none;
		animation: sheet-up 0.28s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.sheet-grip {
		width: 38px;
		height: 4px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.18);
		margin: 0.4rem auto 0.5rem;
	}
	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-height: 1.5rem;
		margin-bottom: 0.5rem;
	}
	.sheet-x {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 44px;
		min-height: 44px;
		margin: -0.5rem -0.5rem -0.5rem 0;
		border-radius: 0.625rem;
		color: var(--color-ink-300);
		font-size: 0.9rem;
		cursor: pointer;
	}
	.sheet-x:hover {
		color: var(--color-ink-100);
		background: rgba(255, 255, 255, 0.05);
	}

	@media (min-width: 640px) {
		.sheet-root {
			justify-content: center;
			align-items: center;
			padding: 1.5rem;
		}
		.sheet-panel {
			width: 100%;
			max-width: 30rem;
			max-height: 80vh;
			border-bottom: 1px solid rgba(255, 255, 255, 0.08);
			border-radius: 1rem;
			animation: sheet-pop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
		}
		.sheet-grip {
			display: none;
		}
	}

	@keyframes sheet-up {
		from {
			transform: translateY(100%);
		}
	}
	@keyframes sheet-pop {
		from {
			transform: translateY(8px) scale(0.98);
			opacity: 0;
		}
	}
	@keyframes sheet-fade {
		from {
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet-panel,
		.sheet-backdrop {
			animation: none;
		}
	}
</style>
