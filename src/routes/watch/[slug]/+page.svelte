<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import type { SpectatorState } from '$lib/server/spectator';
	import Timer from '$lib/components/Timer.svelte';

	let { data }: { data: PageData } = $props();

	let s = $state<SpectatorState>(data.initial);

	const modeLabel: Record<string, string> = {
		closed: 'Floor closed',
		roll_call: 'Roll call',
		formal_debate: 'Formal debate',
		moderated_caucus: 'Moderated caucus',
		unmoderated_caucus: 'Unmoderated caucus',
		voting: 'Voting procedure'
	};

	const isCaucus = $derived(s.mode === 'moderated_caucus' || s.mode === 'unmoderated_caucus');
	const tallyTotal = $derived(s.vote ? s.vote.for + s.vote.against + s.vote.abstain : 0);

	// Poll the public sanitized endpoint every ~2s.
	async function poll() {
		const res = await fetch(`/watch/${data.slug}/state`);
		if (!res.ok) return;
		s = (await res.json()) as SpectatorState;
	}

	onMount(() => {
		const i = setInterval(() => poll().catch(() => {}), 2000);
		return () => clearInterval(i);
	});
</script>

<svelte:head>
	<title>{data.committeeName} — Live (Spectator)</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="surface-chamber relative flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center sm:px-12">
	<!-- Spectator / live badge -->
	<div class="absolute top-5 left-1/2 flex -translate-x-1/2 items-center gap-3 sm:left-6 sm:translate-x-0">
		<span class="label label-brass text-[0.65rem] tracking-[0.25em] text-brass-300">Spectator view</span>
		<span class="flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-widest text-ink-400">
			<span class="pulse-dot inline-block h-2 w-2 rounded-full bg-signal-red"></span>
			Live
		</span>
	</div>

	<!-- Committee identity -->
	<p class="label label-brass text-sm tracking-[0.3em] sm:text-base">{s.name}</p>
	{#if s.topic}
		<p class="mt-3 max-w-3xl text-base text-ink-300 sm:text-lg">{s.topic}</p>
	{/if}

	<!-- Big mode label -->
	<p class="display mt-8 text-4xl text-ink-50 sm:text-6xl">{modeLabel[s.mode] ?? s.mode}</p>

	{#if s.vote}
		<!-- Voting: big For / Against / Abstain counts (no names) -->
		<p class="mt-8 max-w-3xl text-lg text-ink-200 sm:mt-10 sm:text-2xl">{s.vote.label}</p>
		<div class="mt-8 flex items-end gap-8 sm:gap-12">
			<div>
				<p class="font-mono text-5xl font-semibold text-signal-green tabular-nums sm:text-7xl">{s.vote.for}</p>
				<p class="label mt-2 text-signal-green">For</p>
			</div>
			<div>
				<p class="font-mono text-5xl font-semibold text-signal-red tabular-nums sm:text-7xl">{s.vote.against}</p>
				<p class="label mt-2 text-signal-red">Against</p>
			</div>
			<div>
				<p class="font-mono text-5xl font-semibold text-ink-300 tabular-nums sm:text-7xl">{s.vote.abstain}</p>
				<p class="label mt-2 text-ink-400">Abstain</p>
			</div>
		</div>
		<p class="mt-6 font-mono text-sm text-ink-500 tabular-nums">{tallyTotal} ballots cast</p>
	{:else if isCaucus}
		<!-- Caucus: topic + countdown to caucusTimerEndsAt -->
		{#if s.caucusTopic}<p class="mt-8 max-w-3xl text-lg text-ink-200 sm:text-2xl">{s.caucusTopic}</p>{/if}
		<div class="mt-10 scale-[2] sm:scale-[2.5]"><Timer endsAt={s.caucusTimerEndsAt} /></div>
	{:else if s.currentSpeaker}
		<!-- Current speaker: name + country only -->
		<p class="mt-10 text-3xl font-semibold text-ink-50 sm:mt-12 sm:text-4xl">{s.currentSpeaker.name}</p>
		{#if s.currentSpeaker.country}
			<p class="label mt-2 text-base text-ink-400 sm:text-lg">{s.currentSpeaker.country}</p>
		{/if}
	{/if}

	<!-- Resolution on the floor -->
	{#if s.resolution}
		<div class="mt-10 max-w-2xl border-t border-ink-800 pt-6">
			<p class="label text-ink-500">Resolution on the floor</p>
			<p class="mt-2 text-lg text-ink-100 sm:text-xl">
				{#if s.resolution.designation}<span class="text-brass-400">{s.resolution.designation}</span> · {/if}{s.resolution.title || 'Untitled resolution'}
			</p>
		</div>
	{/if}

	<!-- Quorum line -->
	<div class="absolute bottom-6 flex items-center gap-2 text-sm">
		<span class="h-2 w-2 rounded-full {s.quorum.hasQuorum ? 'bg-signal-green' : 'bg-signal-amber'}"></span>
		<span class="font-mono tabular-nums text-ink-400">
			{s.quorum.present}/{s.quorum.total} present · quorum {s.quorum.hasQuorum ? 'met' : 'not met'}
		</span>
	</div>
</div>
