<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<div class="flex min-h-screen flex-col">
	<header class="flex items-center justify-between border-b border-white/[0.06] px-6 py-3.5">
		<div class="flex items-center gap-2.5">
			<div class="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-xs font-semibold">
				M
			</div>
			<span class="text-sm font-medium tracking-tight text-[var(--color-ink-100)]">MIMUN 2026</span>
		</div>

		<div class="flex items-center gap-4">
			<div class="text-right">
				<p class="text-sm leading-tight font-medium text-[var(--color-ink-100)]">{data.delegate.fullName}</p>
				<p class="text-xs leading-tight text-[var(--color-ink-400)]">
					{data.delegate.country || data.delegate.role}
				</p>
			</div>
			<form method="POST" action="/logout">
				<button
					type="submit"
					class="focus-ring rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-[var(--color-ink-300)] transition-colors hover:bg-white/5"
				>
					Sign out
				</button>
			</form>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>
