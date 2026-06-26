<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let overview = $state(data.overview);

	const statusDot: Record<string, string> = {
		pending: 'bg-ink-400',
		in_session: 'bg-signal-green pulse-dot',
		suspended: 'bg-signal-amber',
		closed: 'bg-signal-red'
	};
	const statusLabel: Record<string, string> = { pending: 'Not in session', in_session: 'In session', suspended: 'Suspended', closed: 'Closed' };
	const modeLabel: Record<string, string> = {
		closed: 'Floor closed',
		roll_call: 'Roll call',
		formal_debate: 'Formal debate',
		moderated_caucus: 'Moderated caucus',
		unmoderated_caucus: 'Unmoderated caucus',
		voting: 'Voting'
	};

	async function poll() {
		const res = await fetch('/admin/summary');
		if (!res.ok) return;
		overview = (await res.json()).overview;
	}
	onMount(() => {
		const i = setInterval(() => poll().catch(() => {}), 3000);
		return () => clearInterval(i);
	});

	const totalCommittees = $derived(overview.reduce((n, c) => n + c.committees.length, 0));
	const inSession = $derived(overview.reduce((n, c) => n + c.committees.filter((x) => x.status === 'in_session').length, 0));
	const totalDelegates = $derived(overview.reduce((n, c) => n + c.committees.reduce((m, x) => m + x.delegates, 0), 0));
	const flagged = $derived(overview.flatMap((conf) => conf.committees.filter((c) => c.problems.length > 0)));
</script>

<svelte:head><title>Dashboard — MIMUN 2026 Secretariat</title></svelte:head>

<div class="mx-auto max-w-6xl px-6 py-8">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="label label-brass">Secretariat</p>
			<h1 class="display mt-1 text-3xl text-ink-50">Conference dashboard</h1>
		</div>
		<div class="flex gap-6 text-right">
			<div><p class="font-mono text-2xl text-ink-50 tabular-nums">{totalCommittees}</p><p class="label text-[0.6rem]">Committees</p></div>
			<div><p class="font-mono text-2xl text-signal-green tabular-nums">{inSession}</p><p class="label text-[0.6rem]">In session</p></div>
			<div><p class="font-mono text-2xl text-ink-50 tabular-nums">{totalDelegates}</p><p class="label text-[0.6rem]">Delegates</p></div>
		</div>
	</div>

	{#if flagged.length}
		<div class="card mt-6 border-signal-amber/30 p-4">
			<div class="flex items-center gap-2">
				<span class="h-2 w-2 rounded-full bg-signal-amber pulse-dot"></span>
				<p class="label text-signal-amber">Needs attention · {flagged.length}</p>
			</div>
			<ul class="mt-3 space-y-2">
				{#each flagged as c (c.id)}
					<li class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
						<div class="min-w-0">
							<p class="text-sm font-medium text-ink-100">{c.name}</p>
							<p class="text-xs text-signal-amber">{c.problems.join(' · ')}</p>
						</div>
						<div class="flex shrink-0 gap-2">
							<a href="/committee/{c.slug}" class="btn btn-ghost focus-ring px-3 py-1 text-xs">Open</a>
							<a href="/admin/delegates?committee={c.id}" class="btn btn-quiet focus-ring px-3 py-1 text-xs">Delegates</a>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<details class="card mt-6 p-4">
		<summary class="label label-brass cursor-pointer select-none">First time? Conference setup steps</summary>
		<ol class="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-300">
			<li><a href="/admin/committees" class="text-brass-400 hover:underline">Create your committees</a> and pick each one's rules preset.</li>
			<li><a href="/admin/roster" class="text-brass-400 hover:underline">Import your roster</a> (CSV: name, country, committee, role) — this generates invite codes.</li>
			<li>Assign a <strong>chair</strong> to each committee (set the role under <a href="/admin/delegates" class="text-brass-400 hover:underline">Delegates</a>).</li>
			<li><a href="/admin/print" class="text-brass-400 hover:underline">Print invite cards</a> and hand them out.</li>
			<li>Watch the <strong>Needs attention</strong> panel during the event; <a href="/admin/export" class="text-brass-400 hover:underline">export the record</a> at the end.</li>
		</ol>
	</details>

	{#each overview as conf (conf.id)}
		<section class="mt-8">
			<div class="mb-3 flex items-center gap-3">
				<h2 class="label text-ink-300">{conf.name}</h2>
				<hr class="rule flex-1" />
			</div>

			{#if conf.committees.length === 0}
				<p class="text-sm text-ink-500">No committees yet — <a href="/admin/committees" class="text-brass-400 hover:underline">create one</a>.</p>
			{:else}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
					{#each conf.committees as c (c.id)}
						<div class="card flex flex-col p-4 {c.problems.length ? 'border-signal-amber/40' : ''}">
							<div class="flex items-center justify-between gap-2">
								<span class="flex items-center gap-1.5 text-xs text-ink-300">
									<span class="h-1.5 w-1.5 rounded-full {statusDot[c.status]}"></span>{statusLabel[c.status]}
								</span>
								<span class="label label-brass text-[0.6rem]">{modeLabel[c.mode] ?? c.mode}</span>
							</div>

							<h3 class="display mt-2 text-lg text-ink-50">{c.name}</h3>
							{#if c.topic}<p class="mt-0.5 line-clamp-1 text-xs text-ink-400">{c.topic}</p>{/if}

							<div class="mt-3 flex items-center gap-4 text-xs">
								<span class="font-mono tabular-nums {c.hasQuorum ? 'text-signal-green' : 'text-ink-300'}">
									{c.present}/{c.delegates} <span class="text-ink-500">{c.hasQuorum ? 'quorum' : `need ${c.quorumThreshold}`}</span>
								</span>
								<span class="text-ink-500">{c.voting} voting</span>
							</div>

							{#if c.resolution}
								<div class="mt-2 flex items-center gap-2 rounded-lg border border-brass-600/25 bg-brass-500/[0.06] px-2.5 py-1.5">
									{#if c.resolution.designation}<span class="font-mono text-[0.65rem] text-brass-300">{c.resolution.designation}</span>{/if}
									<span class="line-clamp-1 text-xs text-ink-300">{c.resolution.title}</span>
								</div>
							{/if}

							<div class="mt-4 flex gap-2 border-t border-white/[0.06] pt-3">
								<a href="/committee/{c.slug}" class="btn btn-ghost focus-ring flex-1 py-1.5 text-xs">Open room</a>
								<a href="/admin/delegates?committee={c.id}" class="btn btn-quiet focus-ring flex-1 py-1.5 text-xs">Delegates</a>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</div>
