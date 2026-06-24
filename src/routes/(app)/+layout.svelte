<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const roleLabel: Record<string, string> = { chair: 'Chair', admin: 'Secretariat' };
	const affiliation = data.delegate.country || roleLabel[data.delegate.role] || 'Delegate';
</script>

<div class="surface-chamber flex min-h-screen flex-col">
	<header class="flex h-[57px] items-center justify-between border-b border-white/[0.07] px-6">
		<a href="/" class="flex items-center gap-3">
			<span class="emblem h-8 w-8 rounded-lg text-sm">M</span>
			<span class="flex flex-col leading-none">
				<span class="display text-[0.95rem] text-ink-50">MIMUN 2026</span>
				<span class="label mt-1 text-[0.6rem] text-ink-500">Council Platform</span>
			</span>
		</a>

		<div class="flex items-center gap-4">
			<div class="text-right">
				<p class="text-sm leading-tight font-medium text-ink-100">{data.delegate.fullName}</p>
				<p class="text-xs leading-tight text-ink-400">{affiliation}</p>
			</div>
			<form method="POST" action="/logout">
				<button type="submit" class="btn btn-ghost focus-ring px-3 py-1.5 text-xs">Sign out</button>
			</form>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>
</div>
