<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	import Timer from '$lib/components/Timer.svelte';

	let { data }: { data: PageData } = $props();

	let floor = $state(data.state.floor);
	let att = $state(data.state.attendance);
	let vote = $state(data.state.vote);
	let cstatus = $state(data.state.status);

	type BoardEntry = { name: string; country: string; choice: 'for' | 'against' | 'abstain' | 'pass' | null };
	let board = $state<BoardEntry[]>([]);

	const reduceMotion =
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const modeLabel: Record<string, string> = {
		closed: 'Floor closed',
		roll_call: 'Roll call',
		formal_debate: 'Formal debate',
		moderated_caucus: 'Moderated caucus',
		unmoderated_caucus: 'Unmoderated caucus',
		voting: 'Voting procedure'
	};

	/* ---------------------------------------------------------------- *
	 * Sound — synthesized gavel & chime (no audio assets/dependencies).
	 * Browsers block autoplay until a gesture, so the AudioContext is
	 * created/resumed by the "Enable sound" button; cues no-op until then.
	 * ---------------------------------------------------------------- */
	let audioCtx: AudioContext | null = null;
	let soundOn = $state(false);

	function enableSound() {
		try {
			const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Ctx) return;
			audioCtx ??= new Ctx();
			void audioCtx.resume();
			soundOn = true;
		} catch {
			/* audio unavailable — silently ignore */
		}
	}

	// One low-frequency knock: a short sine burst with a fast decay envelope.
	function knock(at: number, freq: number, gain: number) {
		if (!audioCtx) return;
		const osc = audioCtx.createOscillator();
		const g = audioCtx.createGain();
		osc.type = 'sine';
		osc.frequency.value = freq;
		g.gain.setValueAtTime(0.0001, at);
		g.gain.exponentialRampToValueAtTime(gain, at + 0.005);
		g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
		osc.connect(g).connect(audioCtx.destination);
		osc.start(at);
		osc.stop(at + 0.09);
	}

	// Gavel: two quick ~180Hz knocks (~80ms each).
	function playGavel() {
		try {
			if (!audioCtx || audioCtx.state !== 'running') return;
			const now = audioCtx.currentTime;
			knock(now, 180, 0.6);
			knock(now + 0.12, 175, 0.6);
		} catch {
			/* ignore */
		}
	}

	// Softer two-tone chime for a timer reaching zero.
	function playChime() {
		try {
			if (!audioCtx || audioCtx.state !== 'running') return;
			const now = audioCtx.currentTime;
			const tone = (at: number, freq: number) => {
				if (!audioCtx) return;
				const osc = audioCtx.createOscillator();
				const g = audioCtx.createGain();
				osc.type = 'triangle';
				osc.frequency.value = freq;
				g.gain.setValueAtTime(0.0001, at);
				g.gain.exponentialRampToValueAtTime(0.18, at + 0.01);
				g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
				osc.connect(g).connect(audioCtx.destination);
				osc.start(at);
				osc.stop(at + 0.42);
			};
			tone(now, 880);
			tone(now + 0.18, 1175);
		} catch {
			/* ignore */
		}
	}

	/* ---------------------------------------------------------------- *
	 * Transition detection for cues. We track the previous open-vote id
	 * and whether a timer was still running, and fire on the edge.
	 * ---------------------------------------------------------------- */
	let prevVoteId: string | null = data.state.vote?.id ?? null;
	let prevMode = data.state.floor.mode;

	// Timer fields are typed Date in PageData but arrive as ISO strings after a
	// JSON poll; new Date(...) handles both, and we compare on epoch ms.
	function timerEndsMs(): number | null {
		const ends = floor.caucusTimerEndsAt ?? floor.speakerTimerEndsAt ?? null;
		return ends ? new Date(ends).getTime() : null;
	}
	let prevTimerFuture = (() => {
		const ends = data.state.floor.caucusTimerEndsAt ?? data.state.floor.speakerTimerEndsAt ?? null;
		return ends ? new Date(ends).getTime() > Date.now() : false;
	})();
	let chimedFor: number | null = null;

	function detectCues() {
		// Gavel: the open vote went away, or the floor left voting mode.
		const curVoteId = vote?.id ?? null;
		const leftVoting = prevMode === 'voting' && floor.mode !== 'voting';
		if ((prevVoteId && !curVoteId) || (prevVoteId && curVoteId !== prevVoteId) || leftVoting) {
			playGavel();
		}
		prevVoteId = curVoteId;
		prevMode = floor.mode;

		// Chime: a running timer crossed zero (fire once per endsAt value).
		const ends = timerEndsMs();
		const future = ends !== null && ends > Date.now();
		if (prevTimerFuture && ends !== null && !future && chimedFor !== ends) {
			chimedFor = ends;
			playChime();
		}
		prevTimerFuture = future;
	}

	/* ---------------------------------------------------------------- *
	 * Polling
	 * ---------------------------------------------------------------- */
	async function poll() {
		const res = await fetch(`/committee/${data.committee.slug}/state?since=${encodeURIComponent(new Date().toISOString())}`);
		if (!res.ok) return;
		const u = await res.json();
		floor = u.floor;
		att = u.attendance;
		vote = u.vote;
		cstatus = u.status;
		detectCues();
	}

	async function pollBoard() {
		// Only fetch the board while a vote is in progress.
		if (!vote) {
			if (board.length) board = [];
			return;
		}
		const res = await fetch(`/committee/${data.committee.slug}/voteboard`);
		if (!res.ok) return;
		const u: { vote: { id: string } | null; board: BoardEntry[] } = await res.json();
		board = u.vote ? u.board : [];
	}

	onMount(() => {
		const i = setInterval(() => poll().catch(() => {}), 1000);
		const b = setInterval(() => pollBoard().catch(() => {}), 1000);
		pollBoard().catch(() => {});
		// Catch a timer that elapses with no state change to re-fire detection.
		const t = setInterval(() => detectCues(), 1000);
		return () => {
			clearInterval(i);
			clearInterval(b);
			clearInterval(t);
		};
	});

	const tallyTotal = $derived(vote ? vote.tally.for + vote.tally.against + vote.tally.abstain : 0);

	// Placard color by choice. `pass` (roll-call pass) renders like a pending/dim state.
	const choiceClass: Record<string, string> = {
		for: 'bg-vote-for/15 border-vote-for text-vote-for',
		against: 'bg-vote-against/15 border-vote-against text-vote-against',
		abstain: 'bg-vote-abstain/15 border-vote-abstain text-vote-abstain'
	};
	function placardClass(choice: BoardEntry['choice']): string {
		return (choice && choiceClass[choice]) || 'border-ink-600 text-ink-500';
	}
</script>

<svelte:head><title>{data.committee.name} — Projection</title></svelte:head>

<div class="surface-chamber relative flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-12 py-12 text-center">
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

		<!-- Live placard board: one card per voting delegation -->
		{#if board.length}
			<div class="mt-10 grid w-full max-w-6xl grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
				{#each board as entry (entry.country + entry.name)}
					<div
						class="flex flex-col items-center justify-center rounded-md border px-2 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_6px_-1px_rgba(0,0,0,0.5)] {placardClass(entry.choice)} {reduceMotion ? '' : 'transition-colors duration-300'}"
						title={entry.name}
					>
						<span class="label text-[0.65rem] leading-tight">{entry.country || entry.name}</span>
						<span class="mt-1 font-mono text-[0.7rem] uppercase tabular-nums">
							{#if entry.choice === 'for'}For
							{:else if entry.choice === 'against'}Against
							{:else if entry.choice === 'abstain'}Abstain
							{:else if entry.choice === 'pass'}Pass
							{:else}—{/if}
						</span>
					</div>
				{/each}
			</div>
		{/if}
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

	{#if !soundOn}
		<button
			type="button"
			onclick={enableSound}
			class="absolute right-8 bottom-8 rounded-md border border-brass-600 px-3 py-1.5 font-mono text-xs text-brass-300 hover:text-brass-400"
			title="Browsers block sound until you interact. Enable the gavel & chime cues."
		>
			🔔 Enable sound
		</button>
	{/if}
</div>
