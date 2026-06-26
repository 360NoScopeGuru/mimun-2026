<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageData } from './$types';
	import Timer from '$lib/components/Timer.svelte';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import Sheet from '$lib/components/Sheet.svelte';
	import GlossaryTerm from '$lib/components/GlossaryTerm.svelte';
	import { GLOSSARY } from '$lib/glossary';
	import Coachmark from '$lib/components/Coachmark.svelte';

	let { data }: { data: PageData } = $props();
	const me = data.delegate!;
	const isChair = me.role === 'chair' || me.role === 'deputy_chair' || me.role === 'admin' || me.role === 'secretariat';

	type ChatMessage = Omit<PageData['state']['messages'][number], 'createdAt'> & {
		createdAt: string | Date;
		pending?: boolean;
	};

	let messages = $state<ChatMessage[]>(data.state.messages);
	let floor = $state(data.state.floor);
	let queue = $state(data.state.queue);
	let att = $state(data.state.attendance);
	let vote = $state(data.state.vote);
	let resolution = $state(data.state.resolution);
	let cstatus = $state(data.state.status);
	let pendingMotions = $state(data.state.pendingMotions);
	let points = $state(data.state.points);
	let notes = $state(data.state.notes);

	// Note-passing
	const members = data.members;
	const recipients = $derived(members.filter((m) => m.id !== me.id));
	let noteTo = $state('dais');
	let noteBody = $state('');
	let notesOpen = $state(false); // drives the notes drawer (also opened from the mobile action bar)
	let glossaryOpen = $state(false);
	const glossaryEntries = Object.entries(GLOSSARY);
	let coachOpen = $state(false);
	function dismissCoach() {
		coachOpen = false;
		try {
			localStorage.setItem(`mimun-onboarding-v1-${me.id}`, '1');
		} catch {
			/* ignore */
		}
	}
	const unreadNotes = $derived(notes.filter((n) => n.toId === me.id && !n.readAt).length);

	async function markNotesRead() {
		if (unreadNotes === 0) return;
		await fetch(`/committee/${data.committee.slug}?/markNotesRead`, { method: 'POST', body: new FormData() }).catch(() => {});
		poll().catch(() => {});
	}

	// AI parliamentarian (rules Q&A)
	const askSuggestions = [
		'Can I move to a moderated caucus now?',
		'What majority adopts a resolution?',
		'How do I propose an amendment?'
	];
	let askQ = $state('');
	let askAnswer = $state('');
	let askProvider = $state('');
	let asking = $state(false);
	let askError = $state('');

	async function submitAsk(q = askQ) {
		const question = q.trim();
		if (!question || asking) return;
		askQ = question;
		asking = true;
		askError = '';
		askAnswer = '';
		try {
			const res = await fetch(`/committee/${data.committee.slug}/parliamentarian`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				askError = body.message || 'The parliamentarian is unavailable right now.';
			} else {
				askAnswer = body.answer;
				askProvider = body.provider;
			}
		} catch {
			askError = 'Could not reach the parliamentarian.';
		} finally {
			asking = false;
		}
	}

	const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
	const str = (v: unknown): string => (typeof v === 'string' ? v : '');

	const motionOptions: [string, string][] = [
		['moderated_caucus', 'Moderated caucus'],
		['unmoderated_caucus', 'Unmoderated caucus'],
		['extend_debate', 'Extend debate'],
		['close_debate', 'Close debate → vote'],
		['introduce_resolution', 'Introduce resolution']
	];
	const pointOptions: [string, string][] = [
		['parliamentary_inquiry', 'Parliamentary inquiry'],
		['information', 'Point of information'],
		['order', 'Point of order'],
		['personal_privilege', 'Personal privilege']
	];
	const pointLabel: Record<string, string> = {
		order: 'Point of order',
		information: 'Point of information',
		personal_privilege: 'Personal privilege',
		parliamentary_inquiry: 'Parliamentary inquiry'
	};

	let messageInput = $state('');
	let sending = $state(false);
	let scrollEl: HTMLDivElement;
	let lastEventAt = $state(
		data.state.messages.length > 0
			? new Date(data.state.messages[data.state.messages.length - 1].createdAt).toISOString()
			: new Date(0).toISOString()
	);

	const inQueue = $derived(queue.some((q) => q.delegateId === me.id));
	const canVote = $derived(vote ? (vote.kind === 'substantive' ? att.mine === 'present_and_voting' : att.mine !== 'absent') : false);
	const voteChoices = $derived<[string, string][]>(
		vote?.method === 'roll_call' && vote.round === 1
			? [['for', 'For'], ['against', 'Against'], ['abstain', 'Abstain'], ['pass', 'Pass']]
			: [['for', 'For'], ['against', 'Against'], ['abstain', 'Abstain']]
	);

	const roleLabel: Record<string, string> = { chair: 'Chair', deputy_chair: 'Deputy Chair', admin: 'Secretariat', secretariat: 'Secretariat' };
	const affiliation = (country: string, role?: string) => country || (role ? (roleLabel[role] ?? '') : '');

	const statusLabel: Record<string, string> = { pending: 'Not in session', in_session: 'In session', suspended: 'Suspended', closed: 'Closed' };
	const statusDot: Record<string, string> = { pending: 'bg-ink-400', in_session: 'bg-signal-green pulse-dot', suspended: 'bg-signal-amber', closed: 'bg-signal-red' };
	const modeLabel: Record<string, string> = {
		closed: 'Floor closed',
		roll_call: 'Roll call',
		formal_debate: 'Formal debate',
		moderated_caucus: 'Moderated caucus',
		unmoderated_caucus: 'Unmoderated caucus',
		voting: 'Voting procedure'
	};

	async function scrollToBottom() {
		await tick();
		scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
	}

	async function poll() {
		const res = await fetch(`/committee/${data.committee.slug}/state?since=${encodeURIComponent(lastEventAt)}`);
		if (!res.ok) throw new Error(`state ${res.status}`);
		const u = await res.json();
		if (u.messages.length > 0) {
			const incoming: ChatMessage[] = u.messages;
			// Drop optimistic placeholders the server now confirms, then de-dupe by id
			// so a reconnect resync can re-fetch missed messages without doubling them.
			const confirmed = messages.filter((m) => !m.pending || !incoming.some((i) => i.author === m.author && i.body === m.body));
			const byId = new Map<string, ChatMessage>();
			for (const m of [...confirmed, ...incoming]) byId.set(m.id, m);
			messages = [...byId.values()];
			lastEventAt = new Date(incoming[incoming.length - 1].createdAt).toISOString();
			scrollToBottom();
		}
		floor = u.floor;
		queue = u.queue;
		att = u.attendance;
		vote = u.vote;
		resolution = u.resolution;
		cstatus = u.status;
		pendingMotions = u.pendingMotions;
		points = u.points;
		notes = u.notes;
	}

	// Re-poll immediately after a floor-changing action so the room feels live.
	// (No invalidateAll/update() — the room is driven entirely by poll().) Also
	// disable the clicked button while the action is in flight, so a laggy
	// double-tap can't double-cast a ballot or double-recognize a speaker.
	const refresh: SubmitFunction = ({ submitter }) => {
		const btn = submitter instanceof HTMLButtonElement ? submitter : null;
		if (btn) btn.disabled = true;
		return async () => {
			await poll().catch(() => {});
			if (btn) btn.disabled = false;
		};
	};

	// Self-scheduling poll with exponential backoff + a connection indicator. On
	// reconnect we reset `lastEventAt` so the next poll re-fetches messages missed
	// while offline (de-duped by id in poll()).
	let connection = $state<'live' | 'reconnecting'>('live');
	let pollFails = 0;
	let pollTimer: ReturnType<typeof setTimeout>;
	let stopped = false;

	async function pollLoop() {
		if (stopped) return;
		let delay = 1000;
		try {
			if (pollFails > 0) lastEventAt = new Date(0).toISOString();
			await poll();
			pollFails = 0;
			connection = 'live';
		} catch {
			pollFails++;
			if (pollFails >= 2) connection = 'reconnecting';
			delay = Math.min(15000, 1000 * 2 ** Math.min(pollFails, 4));
		}
		if (!stopped) pollTimer = setTimeout(pollLoop, delay);
	}

	onMount(() => {
		scrollToBottom();
		pollLoop();
		try {
			if (!localStorage.getItem(`mimun-onboarding-v1-${me.id}`)) coachOpen = true;
		} catch {
			/* ignore */
		}
		let crisisTimer: ReturnType<typeof setInterval> | undefined;
		if (crisisOn) {
			loadCrisis();
			crisisTimer = setInterval(loadCrisis, 3000);
		}
		return () => {
			stopped = true;
			clearTimeout(pollTimer);
			if (crisisTimer) clearInterval(crisisTimer);
		};
	});

	const tallyBase = $derived(vote ? vote.tally.for + vote.tally.against : 0);

	// Crisis committee — gated on the committee's rulesConfig.crisis flag. Kept
	// isolated from the main state poll; the feed polls its own endpoint.
	const crisisOn = !!(data.committee.rulesConfig as { crisis?: boolean } | null)?.crisis;
	let crisisFeed = $state<{ id: string; text: string; createdAt: string | Date }[]>([]);
	let crisisBusy = $state(false);
	let directiveText = $state('');

	async function loadCrisis() {
		if (!crisisOn) return;
		try {
			const res = await fetch(`/committee/${data.committee.slug}/crisis`);
			if (res.ok) crisisFeed = (await res.json()).updates ?? [];
		} catch {
			/* ignore */
		}
	}

	async function generateCrisis() {
		if (crisisBusy) return;
		crisisBusy = true;
		try {
			await fetch(`/committee/${data.committee.slug}/crisis`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ directive: directiveText })
			});
			directiveText = '';
			await loadCrisis();
		} catch {
			/* ignore */
		} finally {
			crisisBusy = false;
		}
	}
</script>

<svelte:head><title>{data.committee.name} — MIMUN 2026</title></svelte:head>

<div class="flex min-h-[calc(100vh-57px)] flex-col lg:h-[calc(100vh-57px)]">
	<!-- Floor bar -->
	<div class="flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-white/[0.07] px-5 py-3.5 sm:px-6">
		<div class="min-w-0">
			<div class="flex items-center gap-2">
				<p class="label label-brass">{modeLabel[floor.mode] ?? floor.mode}</p>
				<span class="h-1 w-1 rounded-full bg-ink-600"></span>
				<span class="flex items-center gap-1.5 text-xs text-ink-300">
					<span class="h-1.5 w-1.5 rounded-full {statusDot[cstatus]}"></span>{statusLabel[cstatus]}
				</span>
				{#if connection === 'reconnecting'}
					<span class="flex items-center gap-1.5 text-xs text-signal-amber" title="Lost contact with the server — retrying">
						<span class="h-1.5 w-1.5 rounded-full bg-signal-amber pulse-dot"></span>Reconnecting…
					</span>
				{/if}
			</div>
			<h1 class="display mt-0.5 truncate text-xl text-ink-50">{data.committee.name}</h1>
		</div>
		<div class="flex items-center gap-4">
			<button type="button" onclick={() => (glossaryOpen = true)} class="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 text-xs text-ink-400 transition-colors hover:border-brass-400/40 hover:text-brass-200" title="Glossary — what do these terms mean?" aria-label="Open glossary">?</button>
			<a href="/committee/{data.committee.slug}/lobbying" class="hidden text-xs text-ink-400 transition-colors hover:text-brass-300 md:block">Lobbying</a>
			<a href="/committee/{data.committee.slug}/documents" class="hidden text-xs text-ink-400 transition-colors hover:text-brass-300 md:block">Documents</a>
			{#if isChair}<a href="/committee/{data.committee.slug}/participation" class="hidden text-xs text-ink-400 transition-colors hover:text-brass-300 md:block">Participation</a>{/if}
			{#if floor.mode === 'moderated_caucus' || floor.mode === 'unmoderated_caucus'}
				<div class="rounded-lg border border-brass-600/30 bg-brass-500/[0.08] px-3 py-1.5 shadow-[inset_0_-1px_3px_rgba(0,0,0,0.4)]">
					<Timer endsAt={floor.caucusTimerEndsAt} label="Caucus" />
					{#if floor.caucusTopic}<p class="mt-0.5 max-w-[14rem] truncate text-[0.7rem] text-ink-400">{floor.caucusTopic}</p>{/if}
				</div>
			{/if}
			<div class="text-right">
				<p class="label text-[0.65rem]"><GlossaryTerm term="quorum">Quorum</GlossaryTerm></p>
				<p class="font-mono text-sm tabular-nums {att.hasQuorum ? 'text-signal-green' : 'text-ink-300'}">
					{att.present}/{att.total}
					<span class="text-[0.7rem] text-ink-500">{att.hasQuorum ? 'met' : `need ${att.quorumThreshold}`}</span>
				</p>
			</div>
		</div>
	</div>

	<div class="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[1fr_400px]">
		<!-- Chamber floor: chat -->
		<section class="flex min-h-0 flex-col lg:border-r lg:border-white/[0.07]">
			<div bind:this={scrollEl} class="flex-1 space-y-5 overflow-y-auto px-5 py-6 max-lg:max-h-[52vh] sm:px-6">
				{#each messages as message (message.id)}
					<div class="flex gap-3" class:opacity-50={message.pending}>
						<div class="emblem mt-0.5 h-8 w-8 shrink-0 rounded-full text-xs">{message.author.slice(0, 1)}</div>
						<div class="min-w-0">
							<div class="flex items-baseline gap-2">
								<span class="text-sm font-semibold text-ink-100">{message.author}</span>
								{#if affiliation(message.country, message.role)}<span class="label text-[0.625rem] text-ink-500">{affiliation(message.country, message.role)}</span>{/if}
							</div>
							<p class="mt-1 text-[0.9375rem] leading-relaxed text-ink-200">{message.body}</p>
						</div>
					</div>
				{:else}
					<div class="mt-16 text-center">
						<div class="emblem mx-auto mb-4 h-12 w-12 rounded-full text-lg opacity-70">M</div>
						<p class="text-sm text-ink-500">The floor is quiet — address your committee to begin.</p>
					</div>
				{/each}
			</div>

			<form
				method="POST"
				action="?/sendMessage"
				class="border-t border-white/[0.07] px-5 py-4 sm:px-6"
				use:enhance={() => {
					const body = messageInput.trim();
					const tempId = `temp-${crypto.randomUUID?.() ?? Date.now() + Math.random()}`;
					// Optimistically show our own message immediately.
					messages = [...messages, { id: tempId, body, createdAt: new Date().toISOString(), author: me.fullName, country: me.country, role: me.role, pending: true }];
					messageInput = '';
					sending = true;
					scrollToBottom();
					return async ({ result }) => {
						// Always re-enable the input first, no matter what happens next.
						sending = false;
						if (result.type === 'failure' || result.type === 'error') {
							messages = messages.filter((m) => m.id !== tempId);
							messageInput = body;
						} else {
							// Reconcile the optimistic message with the server copy.
							poll().catch(() => {});
						}
					};
				}}
			>
				<div class="flex items-center gap-3">
					<input name="body" bind:value={messageInput} placeholder="Address your committee…" autocomplete="off" class="input flex-1" />
					<button type="submit" disabled={sending || !messageInput.trim()} class="btn btn-brass focus-ring">Send</button>
				</div>
			</form>
		</section>

		<!-- The dais -->
		<aside class="flex flex-col gap-3 bg-ink-950/30 p-3 sm:p-4 lg:overflow-y-auto">
			<!-- Crisis Director (crisis committees only) -->
			{#if crisisOn}
				<div class="card-live p-4">
					<div class="flex items-center justify-between gap-2">
						<p class="label label-brass">Crisis Director</p>
						<span class="label text-[0.55rem] text-ink-600">AI</span>
					</div>
					<div class="mt-3 max-h-72 space-y-2 overflow-y-auto">
						{#each crisisFeed as u (u.id)}
							<div class="rounded-lg border border-signal-red/25 bg-signal-red/[0.06] px-3 py-2">
								<p class="text-sm leading-relaxed text-ink-100">{u.text}</p>
							</div>
						{:else}
							<p class="text-sm text-ink-500">The situation is calm — for now.</p>
						{/each}
					</div>
					{#if isChair}
						<div class="mt-3 space-y-2">
							<input bind:value={directiveText} placeholder="Directive or prompt for the next update (optional)…" class="input py-2 text-sm" />
							<button type="button" onclick={generateCrisis} disabled={crisisBusy} class="btn btn-brass focus-ring w-full py-2.5 text-sm disabled:opacity-40">{crisisBusy ? 'The situation develops…' : 'Generate crisis update'}</button>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Roll call (delegate sets own presence) -->
			{#if floor.mode === 'roll_call'}
				<div class="card p-4">
					<p class="label label-brass mb-3">Roll call</p>
					{#if isChair}
						<p class="text-sm text-ink-300">{att.present} present · {att.voting} voting · {att.total} members</p>
					{:else}
						<p class="mb-3 text-sm text-ink-400">Declare your delegation present.</p>
						<div class="grid grid-cols-2 gap-2">
							{#each [['present', 'Present'], ['present_and_voting', 'Present & voting']] as [value, text] (value)}
								<form method="POST" action="?/setAttendance" use:enhance={refresh}>
									<input type="hidden" name="status" {value} />
									<button class="btn focus-ring w-full py-2.5 text-sm {att.mine === value ? 'btn-brass' : 'btn-ghost'}">{text}</button>
								</form>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Open vote — the live-action surface -->
			{#if vote}
				<div class="card-live p-4">
					<div class="mb-1.5 flex items-center justify-between">
						<p class="label label-brass">Vote in progress</p>
						<span class="label text-[0.65rem] text-ink-500">
							{vote.method === 'roll_call' ? 'Roll call' : 'Placard'}{vote.round > 1 ? ` · Round ${vote.round}` : ''} · {vote.majorityRule === 'two_thirds' ? '⅔' : 'simple'}
						</span>
					</div>
					<p class="mb-3 text-sm text-ink-100">{vote.label}</p>

					<div class="space-y-2">
						{#each [['for', 'For', 'bg-vote-for'], ['against', 'Against', 'bg-vote-against'], ['abstain', 'Abstain', 'bg-vote-abstain']] as [key, text, color] (key)}
							<div class="flex items-center gap-2.5">
								<span class="w-16 text-xs text-ink-300">{text}</span>
								<div class="h-2.5 flex-1 overflow-hidden rounded-full bg-black/30 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]">
									<div class="{color} h-full rounded-full shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]" style="width: {tallyBase + vote.tally.abstain > 0 ? (vote.tally[key as 'for'] / (tallyBase + vote.tally.abstain)) * 100 : 0}%"></div>
								</div>
								<span class="w-6 text-right font-mono text-sm tabular-nums text-ink-100">{vote.tally[key as 'for']}</span>
							</div>
						{/each}
						{#if vote.tally.pass > 0}
							<p class="text-[0.72rem] text-signal-amber">{vote.tally.pass} passing — must vote next round</p>
						{/if}
					</div>

					{#if !isChair}
						{#if canVote}
							<div class="mt-4 grid {voteChoices.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-2">
								{#each voteChoices as [choice, text] (choice)}
									<form method="POST" action="?/castBallot" use:enhance={refresh}>
										<input type="hidden" name="voteId" value={vote.id} />
										<input type="hidden" name="choice" value={choice} />
										<button class="btn focus-ring w-full py-3 text-sm {vote.myChoice === choice ? 'btn-brass' : 'btn-ghost'}">{text}</button>
									</form>
								{/each}
							</div>
						{:else}
							<p class="mt-3 text-xs text-ink-500">{vote.kind === 'substantive' ? 'Only present-and-voting delegations may vote.' : 'You must be present to vote.'}</p>
						{/if}
					{:else}
						<div class="mt-4 flex gap-2">
							{#if vote.method === 'roll_call' && vote.tally.pass > 0}
								<form method="POST" action="?/advanceRound" use:enhance={refresh} class="flex-1">
									<input type="hidden" name="voteId" value={vote.id} />
									<button class="btn btn-ghost focus-ring w-full py-2.5 text-sm">Second round</button>
								</form>
							{/if}
							<form method="POST" action="?/closeVote" use:enhance={refresh} class="flex-1">
								<input type="hidden" name="voteId" value={vote.id} />
								<button class="btn btn-brass focus-ring w-full py-2.5 text-sm">Close &amp; announce</button>
							</form>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Speaking now -->
			<div class="card p-4">
				<p class="label label-brass">Speaking now</p>
				{#if floor.currentSpeaker}
					<div class="placard mt-3 flex items-center justify-between gap-3">
						<div class="min-w-0">
							<p class="truncate text-base font-semibold text-ink-50 [text-shadow:0_1px_0_rgba(0,0,0,0.55)]">{floor.currentSpeaker.name}</p>
							{#if floor.currentSpeaker.country}<p class="label text-[0.65rem] text-ink-400">{floor.currentSpeaker.country}</p>{/if}
						</div>
						<Timer endsAt={floor.speakerTimerEndsAt} />
					</div>
				{:else}
					<p class="mt-3 text-sm text-ink-500">No one holds the floor.</p>
				{/if}
			</div>

			<!-- Speaker's list -->
			<div class="card p-4">
				<div class="mb-3 flex items-center justify-between">
					<p class="label">Speaker's list</p>
					<span class="font-mono text-xs text-ink-500">{queue.length} waiting</span>
				</div>
				<ol class="space-y-1.5">
					{#each queue as entry, i (entry.id)}
						<li class="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
							<span class="font-mono text-xs font-medium text-brass-400 tabular-nums">{(i + 1).toString().padStart(2, '0')}</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm text-ink-100">{entry.name}</p>
								{#if entry.country}<p class="truncate text-xs text-ink-500">{entry.country}</p>{/if}
							</div>
						</li>
					{:else}
						<p class="rounded-lg border border-dashed border-white/[0.07] px-3 py-4 text-center text-sm text-ink-500">The list is open.</p>
					{/each}
				</ol>
				{#if !isChair}
					<form method="POST" action={inQueue ? '?/leaveQueue' : '?/joinQueue'} use:enhance={refresh} class="mt-3">
						<button class="btn focus-ring w-full {inQueue ? 'btn-ghost' : 'btn-brass'}">{inQueue ? 'Withdraw from the list' : 'Request to speak'}</button>
					</form>
				{/if}
			</div>

			<!-- Motions & points on the floor (only when something is pending) -->
			{#if pendingMotions.length || points.length}
				<div class="card p-4">
					<p class="label label-brass mb-3">On the floor</p>

					{#if pendingMotions.length}
						<ul class="space-y-2">
							{#each pendingMotions as m (m.id)}
								<li class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
									<p class="text-sm text-ink-100">{m.label}</p>
									<p class="text-xs text-ink-500">
										{m.proposerCountry || m.proposer}{#if num(m.params.totalSeconds)} · {Math.round(num(m.params.totalSeconds)! / 60)} min{/if}{#if str(m.params.topic)} · {str(m.params.topic)}{/if}
									</p>
									{#if isChair}
										<div class="mt-2 flex flex-wrap gap-2">
											<form method="POST" action="?/entertainMotion" use:enhance={refresh}><input type="hidden" name="motionId" value={m.id} /><button class="btn btn-brass focus-ring px-3 py-1.5 text-xs">Put to vote</button></form>
											<form method="POST" action="?/adoptMotion" use:enhance={refresh}><input type="hidden" name="motionId" value={m.id} /><button class="btn btn-ghost focus-ring px-3 py-1.5 text-xs">Adopt</button></form>
											<form method="POST" action="?/ruleMotion" use:enhance={refresh}><input type="hidden" name="motionId" value={m.id} /><button class="btn btn-quiet focus-ring px-3 py-1.5 text-xs">Dismiss</button></form>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if points.length}
						<div class="mt-3 space-y-1 {pendingMotions.length ? 'border-t border-white/[0.06] pt-3' : ''}">
							{#each points as p (p.id)}
								<p class="text-xs text-ink-400"><span class="text-brass-400">{pointLabel[p.type]}</span> — {p.byCountry || p.by}{#if p.body}: {p.body}{/if}</p>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Tools: raise a motion or point (delegate) -->
			{#if !isChair}
				<details class="card p-4">
					<summary class="label label-brass cursor-pointer select-none">Raise a motion or point</summary>
					<form method="POST" action="?/raiseMotion" use:enhance={refresh} class="mt-3 rounded-lg border border-white/[0.07] p-3">
						<select name="type" class="input py-2 text-sm">
							{#each motionOptions as [v, t] (v)}<option value={v}>{t}</option>{/each}
						</select>
						<div class="mt-2 flex gap-2">
							<input name="totalSeconds" type="number" min="30" max="3600" value="600" class="input w-24 py-2 text-sm" title="Seconds" />
							<input name="topic" placeholder="Topic (optional)" class="input flex-1 py-2 text-sm" />
						</div>
						{#if resolution}<input type="hidden" name="targetResolutionId" value={resolution.id} />{/if}
						<button class="btn btn-ghost focus-ring mt-2 w-full py-2 text-sm">Raise motion</button>
					</form>
					<form method="POST" action="?/raisePoint" use:enhance={refresh} class="mt-2 rounded-lg border border-white/[0.07] p-3">
						<select name="type" class="input py-2 text-sm">
							{#each pointOptions as [v, t] (v)}<option value={v}>{t}</option>{/each}
						</select>
						<input name="body" placeholder="Detail (optional)" class="input mt-2 py-2 text-sm" />
						<button class="btn btn-ghost focus-ring mt-2 w-full py-2 text-sm">Raise point</button>
					</form>
				</details>
			{/if}

			<!-- Notes (private diplomacy) -->
			<details id="dais-notes" bind:open={notesOpen} class="card p-4" ontoggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) markNotesRead(); }}>
				<summary class="flex cursor-pointer select-none items-center justify-between">
					<span class="label label-brass">Notes{isChair ? ' · moderation' : ''}</span>
					{#if unreadNotes > 0}<span class="rounded-full bg-brass-500 px-2 py-0.5 text-[0.65rem] font-semibold text-ink-950">{unreadNotes}</span>{/if}
				</summary>

				<form
					method="POST"
					action="?/sendNote"
					class="mt-3 flex flex-col gap-2"
					use:enhance={() => {
						const sent = noteBody;
						noteBody = '';
						return async ({ result }) => {
							if (result.type === 'failure' || result.type === 'error') noteBody = sent;
							await poll();
						};
					}}
				>
					<select name="toId" bind:value={noteTo} class="input py-2 text-sm">
						<option value="dais">The dais</option>
						{#each recipients as m (m.id)}<option value={m.id}>{m.country || m.name}</option>{/each}
					</select>
					<div class="flex gap-2">
						<input name="body" bind:value={noteBody} placeholder="Private note…" autocomplete="off" maxlength="500" class="input flex-1 py-2 text-sm" />
						<button type="submit" disabled={!noteBody.trim()} class="btn btn-brass focus-ring px-3 py-2 text-sm">Pass</button>
					</div>
				</form>

				<div class="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
					{#each notes as n (n.id)}
						<div class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
							<p class="label text-[0.6rem] text-ink-500">
								{#if n.fromId === me.id}You → {n.toName ? (n.toCountry || n.toName) : 'The dais'}
								{:else}{n.fromCountry || n.fromName} → {n.toName ? (n.toCountry || n.toName) : 'The dais'}{/if}
							</p>
							<p class="mt-0.5 text-sm text-ink-200">{n.body}</p>
						</div>
					{:else}
						<p class="text-xs text-ink-500">No notes yet — pass a private note to another delegation.</p>
					{/each}
				</div>
			</details>

			<!-- AI parliamentarian -->
			{#if data.aiConfigured}
				<details class="card p-4">
					<summary class="flex cursor-pointer select-none items-center justify-between">
						<span class="label label-brass">Parliamentarian</span>
						<span class="label text-[0.6rem] text-ink-600">AI</span>
					</summary>
					<p class="mt-2 text-xs text-ink-500">
						Ask about the rules of procedure — quorum, majorities, motions, amendments.
					</p>
					<form
						class="mt-3 flex gap-2"
						onsubmit={(e) => {
							e.preventDefault();
							submitAsk();
						}}
					>
						<input
							bind:value={askQ}
							placeholder="e.g. What majority adopts a resolution?"
							maxlength="500"
							class="input flex-1 py-2 text-sm"
						/>
						<button type="submit" disabled={!askQ.trim() || asking} class="btn btn-brass focus-ring px-3 py-2 text-sm">
							{asking ? '…' : 'Ask'}
						</button>
					</form>
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#each askSuggestions as s (s)}
							<button
								type="button"
								onclick={() => submitAsk(s)}
								disabled={asking}
								class="rounded-full border border-white/10 px-3 py-1.5 text-xs text-ink-400 transition-colors hover:border-brass-400/40 hover:text-brass-200 disabled:opacity-40"
							>
								{s}
							</button>
						{/each}
					</div>
					{#if asking}
						<p class="mt-3 text-xs text-ink-500">Consulting the rules…</p>
					{:else if askError}
						<p class="mt-3 text-xs text-signal-amber">{askError}</p>
					{:else if askAnswer}
						<div class="mt-3 rounded-lg border border-brass-400/20 bg-brass-400/[0.04] px-3 py-2.5">
							<p class="whitespace-pre-wrap text-sm leading-relaxed text-ink-100">{askAnswer}</p>
							{#if askProvider}<p class="label mt-2 text-[0.6rem] text-ink-600">via {askProvider}</p>{/if}
						</div>
					{/if}
				</details>
			{/if}

			<!-- Resolution on the table -->
			{#if resolution}
				<a href="/committee/{data.committee.slug}/resolutions" class="card block p-4 transition-colors hover:border-brass-600/30">
					<p class="label label-brass mb-2">Resolution</p>
					<div class="flex items-center gap-2">
						{#if resolution.designation}<span class="rounded border border-brass-600/40 px-1.5 py-0.5 font-mono text-[0.65rem] text-brass-300">{resolution.designation}</span>{/if}
						<span class="text-[0.65rem] text-ink-500 uppercase">{resolution.status}</span>
					</div>
					<p class="mt-1.5 text-sm leading-snug text-ink-200">{resolution.title}</p>
					<p class="mt-1 text-xs text-brass-400">Open in the drafting room →</p>
				</a>
			{/if}

			<!-- Chair console -->
			{#if isChair}
				<details open class="card p-4">
					<summary class="label label-brass cursor-pointer select-none">Chair console</summary>

					<div class="mt-3 space-y-3">
						<!-- Roll call -->
						{#if floor.mode === 'roll_call'}
							<form method="POST" action="?/closeRollCall" use:enhance={refresh}>
								<button class="btn btn-ghost focus-ring w-full py-2.5 text-sm">Close roll call</button>
							</form>
						{:else}
							<form method="POST" action="?/openRollCall" use:enhance={refresh}>
								<button class="btn btn-ghost focus-ring w-full py-2.5 text-sm">Take roll call</button>
							</form>
						{/if}

						<!-- Speaker -->
						<form method="POST" action="?/callNext" use:enhance={refresh}>
							<button disabled={queue.length === 0} class="btn btn-brass focus-ring w-full py-2.5 text-sm">Recognize next speaker</button>
						</form>

						<!-- Caucus -->
						{#if floor.mode === 'moderated_caucus' || floor.mode === 'unmoderated_caucus'}
							<form method="POST" action="?/endCaucus" use:enhance={refresh}>
								<button class="btn btn-ghost focus-ring w-full py-2.5 text-sm">End caucus</button>
							</form>
						{:else}
							<form method="POST" action="?/startCaucus" use:enhance={refresh} class="rounded-lg border border-white/[0.07] p-3">
								<p class="label mb-2 text-[0.65rem]">Start caucus</p>
								<div class="flex gap-2">
									<select name="type" class="input flex-1 py-2 text-sm">
										<option value="moderated_caucus">Moderated</option>
										<option value="unmoderated_caucus">Unmoderated</option>
									</select>
									<input name="totalSeconds" type="number" min="30" max="3600" value="600" class="input w-24 py-2 text-sm" title="Total seconds" />
								</div>
								<input name="topic" placeholder="Topic (optional)" class="input mt-2 py-2 text-sm" />
								<button class="btn btn-brass focus-ring mt-2 w-full py-2.5 text-sm">Start</button>
							</form>
						{/if}

						<!-- Vote -->
						{#if !vote}
							<form method="POST" action="?/openVote" use:enhance={refresh} class="rounded-lg border border-white/[0.07] p-3">
								<p class="label mb-2 text-[0.65rem]">Open a vote</p>
								<input name="label" placeholder="Question put to the floor…" class="input py-2 text-sm" />
								<select name="majorityRule" class="input mt-2 py-2 text-sm">
									<option value="simple">Simple majority</option>
									<option value="two_thirds">Two-thirds majority</option>
								</select>
								<button class="btn btn-brass focus-ring mt-2 w-full py-2.5 text-sm">Open vote</button>
							</form>
						{/if}

						<!-- Crisis committee -->
						<form method="POST" action="?/toggleCrisis" use:enhance={() => () => location.reload()} class="rounded-lg border border-white/[0.07] p-3">
							<p class="label mb-2 text-[0.65rem]">Crisis committee</p>
							{#if crisisOn}
								<input type="hidden" name="on" value="false" />
								<button class="btn btn-ghost focus-ring w-full py-2.5 text-sm">Disable crisis mode</button>
							{:else}
								<input type="hidden" name="on" value="true" />
								<input name="scenario" placeholder="Crisis scenario (premise)…" class="input mb-2 py-2 text-sm" />
								<button class="btn btn-brass focus-ring w-full py-2.5 text-sm">Enable crisis mode</button>
							{/if}
						</form>

						<!-- Session status -->
						<div>
							<p class="label mt-1 mb-2 text-[0.65rem]">Session</p>
							<div class="grid grid-cols-3 gap-2">
								{#each [['in_session', 'Open'], ['suspended', 'Suspend'], ['closed', 'Close']] as [value, text] (value)}
									<form method="POST" action="?/setStatus" use:enhance={refresh}>
										<input type="hidden" name="status" {value} />
										<button class="btn focus-ring w-full py-2.5 text-sm {cstatus === value ? 'btn-ghost border-brass-600/50 text-brass-300' : 'btn-quiet'}">{text}</button>
									</form>
								{/each}
							</div>
						</div>
					</div>
				</details>
			{/if}
		</aside>
	</div>

	<Sheet bind:open={glossaryOpen} title="Glossary">
		<dl class="space-y-3">
			{#each glossaryEntries as [key, def] (key)}
				<div>
					<dt class="text-sm font-semibold text-ink-100">{key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())}</dt>
					<dd class="mt-0.5 text-sm leading-relaxed text-ink-400">{def}</dd>
				</div>
			{/each}
		</dl>
	</Sheet>

	{#if coachOpen}
		<Coachmark title="Welcome to the floor" ondismiss={dismissCoach}>
			{#if isChair}
				<p>You’re chairing <strong>{data.committee.name}</strong>. Three moves to know:</p>
				<p>· <strong>Recognize</strong> the next speaker · <strong>Open a vote</strong> when it’s time · your full <strong>Console</strong> sits in the dais panel.</p>
				<p class="text-ink-400">Tap the <strong>?</strong> up top anytime for plain-English definitions.</p>
			{:else if floor.mode === 'roll_call'}
				<p><strong>First thing:</strong> tap <strong>Present</strong> (or Present &amp; voting) so you count toward quorum.</p>
				<p>After that you can request to speak and vote. Tap the <strong>?</strong> up top if a term is unfamiliar.</p>
			{:else}
				<p>Your three moves as a delegate:</p>
				<p>· <strong>Request to speak</strong> — you’ll see your place in line · <strong>Vote</strong> when one opens · pass private <strong>Notes</strong> to other delegations.</p>
				<p class="text-ink-400">New to the jargon? Tap the <strong>?</strong> up top for the glossary.</p>
			{/if}
		</Coachmark>
	{/if}

	<!-- Mobile quick actions — the live action is one tap away without scrolling -->
	<div class="lg:hidden">
		<ActionBar>
			{#if vote && !isChair && canVote}
				{#each voteChoices as [choice, text] (choice)}
					<form method="POST" action="?/castBallot" use:enhance={refresh}>
						<input type="hidden" name="voteId" value={vote.id} />
						<input type="hidden" name="choice" value={choice} />
						<button class="btn focus-ring w-full {vote.myChoice === choice ? 'btn-brass' : 'btn-ghost'}">{text}</button>
					</form>
				{/each}
			{:else if isChair}
				<form method="POST" action="?/callNext" use:enhance={refresh}>
					<button disabled={queue.length === 0} class="btn btn-brass focus-ring w-full">Recognize next</button>
				</form>
				{#if vote}
					<form method="POST" action="?/closeVote" use:enhance={refresh}>
						<input type="hidden" name="voteId" value={vote.id} />
						<button class="btn btn-ghost focus-ring w-full">Close vote</button>
					</form>
				{/if}
			{:else}
				<form method="POST" action={inQueue ? '?/leaveQueue' : '?/joinQueue'} use:enhance={refresh}>
					<button class="btn focus-ring w-full {inQueue ? 'btn-ghost' : 'btn-brass'}">{inQueue ? 'Withdraw' : 'Raise hand'}</button>
				</form>
				<button type="button" class="btn btn-ghost focus-ring w-full" onclick={() => { notesOpen = true; document.getElementById('dais-notes')?.scrollIntoView({ behavior: 'smooth' }); }}>Notes</button>
			{/if}
		</ActionBar>
	</div>
</div>
