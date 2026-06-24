<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Timer from '$lib/components/Timer.svelte';

	let { data }: { data: PageData } = $props();

	let floor = $state(data.state.floor);
	let att = $state(data.state.attendance);
	let vote = $state(data.state.vote);
	let cstatus = $state(data.state.status);

	const modeLabel: Record<string, string> = {
		closed: 'Floor closed',
		roll_call: 'Roll call',
		formal_debate: 'Formal debate',
		moderated_caucus: 'Moderated caucus',
		unmoderated_caucus: 'Unmoderated caucus',
		voting: 'Voting procedure'
	};

	async function poll() {
		const res = await fetch(`/committee/${data.committee.slug}/state?since=${encodeURIComponent(new Date().toISOString())}`);
		if (!res.ok) return;
		const u = await res.json();
		floor = u.floor;
		att = u.attendance;
		vote = u.vote;
		cstatus = u.status;
	}

	onMount(() => {
		const i = setInterval(() => poll().catch(() => {}), 1000);
		return () => clearInterval(i);
	});

	const tallyTotal = $derived(vote ? vote.tally.for + vote.tally.against + vote.tally.abstain : 0);
</script>

<svelte:head><title>{data.committee.name} — Projection</title></svelte:head>

<div class="surface-chamber flex h-[calc(100vh-57px)] flex-col items-center justify-center px-12 text-center">
	<p class="label label-brass text-base tracking-[0.3em]">{data.committee.name}</p>
	<p class="display mt-4 text-6xl text-ink-50">{modeLabel[floor.mode] ?? floor.mode}</p>

	{#if vote}
		<!-- Voting: big tally -->
		<p class="mt-10 max-w-3xl text-2xl text-ink-200">{vote.label}</p>
		<div class="mt-8 flex items-end gap-12">
			<div>
				<p class="font-mono text-7xl font-semibold text-signal-green tabular-nums">{vote.tally.for}</p>
				<p class="label mt-2 text-signal-green">For</p>
			</div>
			<div>
				<p class="font-mono text-7xl font-semibold text-signal-red tabular-nums">{vote.tally.against}</p>
				<p class="label mt-2 text-signal-red">Against</p>
			</div>
			<div>
				<p class="font-mono text-7xl font-semibold text-ink-300 tabular-nums">{vote.tally.abstain}</p>
				<p class="label mt-2 text-ink-400">Abstain</p>
			</div>
		</div>
		<p class="mt-6 font-mono text-sm text-ink-500">{tallyTotal} of {att.voting} voting delegations cast</p>
	{:else if floor.mode === 'moderated_caucus' || floor.mode === 'unmoderated_caucus'}
		{#if floor.caucusTopic}<p class="mt-8 max-w-3xl text-2xl text-ink-200">{floor.caucusTopic}</p>{/if}
		<div class="mt-10 scale-[2.5]"><Timer endsAt={floor.caucusTimerEndsAt} /></div>
	{:else if floor.currentSpeaker}
		<p class="mt-12 text-4xl font-semibold text-ink-50">{floor.currentSpeaker.name}</p>
		{#if floor.currentSpeaker.country}<p class="label mt-2 text-lg text-ink-400">{floor.currentSpeaker.country}</p>{/if}
		<div class="mt-8 scale-[2]"><Timer endsAt={floor.speakerTimerEndsAt} /></div>
	{/if}

	<div class="absolute bottom-8 flex items-center gap-2 text-sm">
		<span class="h-2 w-2 rounded-full {att.hasQuorum ? 'bg-signal-green' : 'bg-signal-amber'}"></span>
		<span class="font-mono tabular-nums text-ink-400">{att.present}/{att.total} present · quorum {att.hasQuorum ? 'met' : 'not met'}</span>
	</div>
</div>
