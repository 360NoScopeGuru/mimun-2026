<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import SmallScreenNotice from '$lib/components/SmallScreenNotice.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const nav: [string, string][] = [
		['/admin', 'Dashboard'],
		['/admin/committees', 'Committees'],
		['/admin/delegates', 'Delegates'],
		['/admin/roster', 'Roster import'],
		['/admin/print', 'Invite cards'],
		['/admin/certificates', 'Certificates']
	];
	const isActive = (href: string) => (href === '/admin' ? page.url.pathname === '/admin' : page.url.pathname.startsWith(href));
</script>

<div class="surface-chamber flex min-h-screen flex-col">
	<header class="flex h-[57px] items-center justify-between border-b border-white/[0.07] px-6">
		<div class="flex items-center gap-6">
			<a href="/admin" class="flex items-center gap-3">
				<span class="emblem h-8 w-8 rounded-lg text-sm">M</span>
				<span class="flex flex-col leading-none">
					<span class="display text-[1.05rem] font-semibold text-ink-50">MIMUN 2026</span>
					<span class="label mt-1 text-[0.6rem] text-brass-400">Secretariat</span>
				</span>
			</a>
			<nav class="hidden items-center gap-1 sm:flex">
				{#each nav as [href, text] (href)}
					<a
						{href}
						class="rounded-lg px-3 py-1.5 text-sm transition-colors {isActive(href) ? 'bg-white/[0.06] text-ink-50' : 'text-ink-400 hover:text-ink-100'}"
					>
						{text}
					</a>
				{/each}
			</nav>
		</div>

		<div class="flex items-center gap-4">
			<div class="text-right">
				<p class="text-sm leading-tight font-medium text-ink-100">{data.delegate.fullName}</p>
				<p class="text-xs leading-tight text-ink-400">Secretariat</p>
			</div>
			<form method="POST" action="/logout">
				<button type="submit" class="btn btn-ghost focus-ring px-3 py-1.5 text-xs">Sign out</button>
			</form>
		</div>
	</header>

	<main class="flex-1">
		<SmallScreenNotice feature="The secretariat console" />
		<div class="hidden sm:block">{@render children()}</div>
	</main>
</div>
