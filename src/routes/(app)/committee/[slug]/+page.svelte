<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, tick } from 'svelte';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { PageData } from './$types';
	import Timer from '$lib/components/Timer.svelte';

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
	const unreadNotes = $derived(notes.filter((n) => n.toId === me.id && !n.readAt).length);

	async function markNotesRead() {
		if (unreadNotes === 0) return;
		await fetch(`/committee/${data.committee.slug}?/markNotesRead`, { method: 'POST', body: new FormData() }).catch(() => {});
		poll().catch(() => {});
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
		vote?.method === 'roll_call'
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
		if (!res.ok) return;
		const u = await res.json();
		if (u.messages.length > 0) {
			const incoming: ChatMessage[] = u.messages;
			const confirmed = messages.filter((m) => !m.pending || !incoming.some((i) => i.author === m.author && i.body === m.body));
			messages = [...confirmed, ...incoming];
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
	// (No invalidateAll/update() — the room is driven entirely by poll().)
	const refresh: SubmitFunction = () => async () => {
		await poll();
	};

	onMount(() => {
		scrollToBottom();
		const i = setInterval(() => poll().catch(() => {}), 1000);
		return () => clearInterval(i);
	});

	const tallyBase = $derived(vote ? vote.tally.for + vote.tally.against : 0);
</script>

<svelte:head><title>{data.committee.name} — MIMUN 2026</title></svelte:head>

<div class="flex h-[calc(100vh-57px)] flex-col">
	<!-- Floor bar -->
	<div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-6 py-3">
		<div class="min-w-0">
			<div class="flex items-center gap-2">
				<p class="label label-brass">{modeLabel[floor.mode] ?? floor.mode}</p>
				<span class="h-1 w-1 rounded-full bg-ink-600"></span>
				<span class="flex items-center gap-1.5 text-xs text-ink-300">
					<span class="h-1.5 w-1.5 rounded-full {statusDot[cstatus]}"></span>{statusLabel[cstatus]}
				</span>
			</div>
			<h1 class="display mt-0.5 truncate text-lg text-ink-50">{data.committee.name}</h1>
		</div>
		<div class="flex items-center gap-4">
			<a href="/committee/{data.committee.slug}/documents" class="hidden text-xs text-ink-400 transition-colors hover:text-brass-300 sm:block">Documents</a>
			{#if isChair}<a href="/committee/{data.committee.slug}/participation" class="hidden text-xs text-ink-400 transition-colors hover:text-brass-300 sm:block">Participation</a>{/if}
			{#if floor.mode === 'moderated_caucus' || floor.mode === 'unmoderated_caucus'}
				<div class="rounded-lg border border-brass-600/30 bg-brass-500/[0.08] px-3 py-1.5">
					<Timer endsAt={floor.caucusTimerEndsAt} label="Caucus" />
					{#if floor.caucusTopic}<p class="mt-0.5 max-w-[14rem] truncate text-[0.7rem] text-ink-400">{floor.caucusTopic}</p>{/if}
				</div>
			{/if}
			<div class="text-right">
				<p class="label text-[0.6rem]">Quorum</p>
				<p class="font-mono text-sm tabular-nums {att.hasQuorum ? 'text-signal-green' : 'text-ink-300'}">
					{att.present}/{att.total}
					<span class="text-[0.65rem] text-ink-500">{att.hasQuorum ? 'met' : `need ${att.quorumThreshold}`}</span>
				</p>
			</div>
		</div>
	</div>

	<div class="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_400px]">
		<!-- Chamber floor: chat -->
		<section class="flex min-w-0 flex-col border-r border-white/[0.07]">
			<div bind:this={scrollEl} class="flex-1 space-y-5 overflow-y-auto px-6 py-6">
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
				class="border-t border-white/[0.07] px-6 py-4"
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
		<aside class="flex flex-col overflow-y-auto bg-ink-950/30">
			<!-- Roll call (delegate sets own presence) -->
			{#if floor.mode === 'roll_call'}
				<div class="border-b border-white/[0.07] px-5 py-4">
					<p class="label label-brass mb-3">Roll call</p>
					{#if isChair}
						<p class="text-sm text-ink-300">{att.present} present · {att.voting} voting · {att.total} members</p>
					{:else}
						<p class="mb-3 text-sm text-ink-400">Declare your delegation present.</p>
						<div class="grid grid-cols-2 gap-2">
							{#each [['present', 'Present'], ['present_and_voting', 'Present & voting']] as [value, text] (value)}
								<form method="POST" action="?/setAttendance" use:enhance={refresh}>
									<input type="hidden" name="status" {value} />
									<button class="btn focus-ring w-full py-2 text-xs {att.mine === value ? 'btn-brass' : 'btn-ghost'}">{text}</button>
								</form>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Open vote -->
			{#if vote}
				<div class="border-b border-white/[0.07] px-5 py-4">
					<div class="mb-1 flex items-center justify-between">
						<p class="label label-brass">Vote in progress</p>
						<span class="label text-[0.6rem] text-ink-500">
							{vote.method === 'roll_call' ? 'Roll call' : 'Placard'}{vote.round > 1 ? ` · Round ${vote.round}` : ''} · {vote.majorityRule === 'two_thirds' ? '⅔' : 'simple'}
						</span>
					</div>
					<p class="mb-3 text-sm text-ink-100">{vote.label}</p>

					<div class="space-y-1.5">
						{#each [['for', 'For', 'bg-vote-for'], ['against', 'Against', 'bg-vote-against'], ['abstain', 'Abstain', 'bg-vote-abstain']] as [key, text, color] (key)}
							<div class="flex items-center gap-2">
								<span class="w-16 text-xs text-ink-300">{text}</span>
								<div class="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
									<div class="{color} h-full rounded-full" style="width: {tallyBase + vote.tally.abstain > 0 ? (vote.tally[key as 'for'] / (tallyBase + vote.tally.abstain)) * 100 : 0}%"></div>
								</div>
								<span class="w-6 text-right font-mono text-xs tabular-nums text-ink-200">{vote.tally[key as 'for']}</span>
							</div>
						{/each}
						{#if vote.tally.pass > 0}
							<p class="text-[0.7rem] text-signal-amber">{vote.tally.pass} passing — must vote next round</p>
						{/if}
					</div>

					{#if !isChair}
						{#if canVote}
							<div class="mt-3 grid {voteChoices.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5">
								{#each voteChoices as [choice, text] (choice)}
									<form method="POST" action="?/castBallot" use:enhance={refresh}>
										<input type="hidden" name="voteId" value={vote.id} />
										<input type="hidden" name="choice" value={choice} />
										<button class="btn focus-ring w-full py-2 text-xs {vote.myChoice === choice ? 'btn-brass' : 'btn-ghost'}">{text}</button>
									</form>
								{/each}
							</div>
						{:else}
							<p class="mt-3 text-xs text-ink-500">{vote.kind === 'substantive' ? 'Only present-and-voting delegations may vote.' : 'You must be present to vote.'}</p>
						{/if}
					{:else}
						<div class="mt-3 flex gap-2">
							{#if vote.method === 'roll_call' && vote.tally.pass > 0}
								<form method="POST" action="?/advanceRound" use:enhance={refresh} class="flex-1">
									<input type="hidden" name="voteId" value={vote.id} />
									<button class="btn btn-ghost focus-ring w-full py-2 text-xs">Second round</button>
								</form>
							{/if}
							<form method="POST" action="?/closeVote" use:enhance={refresh} class="flex-1">
								<input type="hidden" name="voteId" value={vote.id} />
								<button class="btn btn-brass focus-ring w-full py-2 text-xs">Close &amp; announce</button>
							</form>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Speaking now + speaker's list -->
			<div class="border-b border-white/[0.07] px-5 py-4">
				<p class="label label-brass">Speaking now</p>
				{#if floor.currentSpeaker}
					<div class="mt-3 flex items-center justify-between gap-3 rounded-xl border border-brass-600/30 bg-brass-500/[0.08] px-4 py-3">
						<div class="min-w-0">
							<p class="truncate text-sm font-semibold text-ink-50">{floor.currentSpeaker.name}</p>
							{#if floor.currentSpeaker.country}<p class="label text-[0.625rem] text-ink-400">{floor.currentSpeaker.country}</p>{/if}
						</div>
						<Timer endsAt={floor.speakerTimerEndsAt} />
					</div>
				{:else}
					<p class="mt-3 text-sm text-ink-500">No one holds the floor.</p>
				{/if}
			</div>

			<div class="border-b border-white/[0.07] px-5 py-4">
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

			<!-- Motions & points on the floor -->
			<div class="border-b border-white/[0.07] px-5 py-4">
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
									<div class="mt-2 flex gap-1.5">
										<form method="POST" action="?/entertainMotion" use:enhance={refresh}><input type="hidden" name="motionId" value={m.id} /><button class="btn btn-brass focus-ring px-2 py-1 text-[0.65rem]">Put to vote</button></form>
										<form method="POST" action="?/adoptMotion" use:enhance={refresh}><input type="hidden" name="motionId" value={m.id} /><button class="btn btn-ghost focus-ring px-2 py-1 text-[0.65rem]">Adopt</button></form>
										<form method="POST" action="?/ruleMotion" use:enhance={refresh}><input type="hidden" name="motionId" value={m.id} /><button class="btn btn-quiet focus-ring px-2 py-1 text-[0.65rem]">Dismiss</button></form>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-ink-500">No motions pending.</p>
				{/if}

				{#if points.length}
					<div class="mt-3 space-y-1 border-t border-white/[0.06] pt-3">
						{#each points as p (p.id)}
							<p class="text-xs text-ink-400"><span class="text-brass-400">{pointLabel[p.type]}</span> — {p.byCountry || p.by}{#if p.body}: {p.body}{/if}</p>
						{/each}
					</div>
				{/if}

				{#if !isChair}
					<details class="mt-3">
						<summary class="cursor-pointer text-xs text-brass-400">Raise a motion or point</summary>
						<form method="POST" action="?/raiseMotion" use:enhance={refresh} class="mt-2 rounded-lg border border-white/[0.07] p-3">
							<select name="type" class="input py-1.5 text-xs">
								{#each motionOptions as [v, t] (v)}<option value={v}>{t}</option>{/each}
							</select>
							<div class="mt-2 flex gap-2">
								<input name="totalSeconds" type="number" min="30" max="3600" value="600" class="input w-20 py-1.5 text-xs" title="Seconds" />
								<input name="topic" placeholder="Topic (optional)" class="input flex-1 py-1.5 text-xs" />
							</div>
							{#if resolution}<input type="hidden" name="targetResolutionId" value={resolution.id} />{/if}
							<button class="btn btn-ghost focus-ring mt-2 w-full py-1.5 text-xs">Raise motion</button>
						</form>
						<form method="POST" action="?/raisePoint" use:enhance={refresh} class="mt-2 rounded-lg border border-white/[0.07] p-3">
							<select name="type" class="input py-1.5 text-xs">
								{#each pointOptions as [v, t] (v)}<option value={v}>{t}</option>{/each}
							</select>
							<input name="body" placeholder="Detail (optional)" class="input mt-2 py-1.5 text-xs" />
							<button class="btn btn-ghost focus-ring mt-2 w-full py-1.5 text-xs">Raise point</button>
						</form>
					</details>
				{/if}
			</div>

			<!-- Notes (private diplomacy) -->
			<div class="border-b border-white/[0.07] px-5 py-4">
				<details ontoggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) markNotesRead(); }}>
					<summary class="flex cursor-pointer items-center justify-between">
						<span class="label label-brass">Notes{isChair ? ' · moderation' : ''}</span>
						{#if unreadNotes > 0}<span class="rounded-full bg-brass-500 px-1.5 py-0.5 text-[0.6rem] font-semibold text-ink-950">{unreadNotes}</span>{/if}
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
						<select name="toId" bind:value={noteTo} class="input py-1.5 text-xs">
							<option value="dais">The dais</option>
							{#each recipients as m (m.id)}<option value={m.id}>{m.country || m.name}</option>{/each}
						</select>
						<div class="flex gap-2">
							<input name="body" bind:value={noteBody} placeholder="Private note…" autocomplete="off" maxlength="500" class="input flex-1 py-1.5 text-xs" />
							<button type="submit" disabled={!noteBody.trim()} class="btn btn-brass focus-ring px-3 py-1.5 text-xs">Pass</button>
						</div>
					</form>

					<div class="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
						{#each notes as n (n.id)}
							<div class="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
								<p class="label text-[0.55rem] text-ink-500">
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
			</div>

			<!-- Resolution on the table -->
			{#if resolution}
				<a href="/committee/{data.committee.slug}/resolutions" class="block border-b border-white/[0.07] px-5 py-4 transition-colors hover:bg-white/[0.02]">
					<p class="label label-brass mb-2">Resolution</p>
					<div class="flex items-center gap-2">
						{#if resolution.designation}<span class="rounded border border-brass-600/40 px-1.5 py-0.5 font-mono text-[0.65rem] text-brass-300">{resolution.designation}</span>{/if}
						<span class="text-[0.625rem] text-ink-500 uppercase">{resolution.status}</span>
					</div>
					<p class="mt-1.5 text-sm leading-snug text-ink-200">{resolution.title}</p>
					<p class="mt-1 text-xs text-brass-400">Open in the drafting room →</p>
				</a>
			{/if}

			<!-- Chair console -->
			{#if isChair}
				<div class="px-5 py-4">
					<p class="label label-brass mb-3">Chair controls</p>

					<div class="space-y-3">
						<!-- Roll call -->
						{#if floor.mode === 'roll_call'}
							<form method="POST" action="?/closeRollCall" use:enhance={refresh}>
								<button class="btn btn-ghost focus-ring w-full py-2 text-xs">Close roll call</button>
							</form>
						{:else}
							<form method="POST" action="?/openRollCall" use:enhance={refresh}>
								<button class="btn btn-ghost focus-ring w-full py-2 text-xs">Take roll call</button>
							</form>
						{/if}

						<!-- Speaker -->
						<form method="POST" action="?/callNext" use:enhance={refresh}>
							<button disabled={queue.length === 0} class="btn btn-brass focus-ring w-full py-2 text-xs">Recognize next speaker</button>
						</form>

						<!-- Caucus -->
						{#if floor.mode === 'moderated_caucus' || floor.mode === 'unmoderated_caucus'}
							<form method="POST" action="?/endCaucus" use:enhance={refresh}>
								<button class="btn btn-ghost focus-ring w-full py-2 text-xs">End caucus</button>
							</form>
						{:else}
							<form method="POST" action="?/startCaucus" use:enhance={refresh} class="rounded-lg border border-white/[0.07] p-3">
								<p class="label mb-2 text-[0.6rem]">Start caucus</p>
								<div class="flex gap-2">
									<select name="type" class="input flex-1 py-1.5 text-xs">
										<option value="moderated_caucus">Moderated</option>
										<option value="unmoderated_caucus">Unmoderated</option>
									</select>
									<input name="totalSeconds" type="number" min="30" max="3600" value="600" class="input w-20 py-1.5 text-xs" title="Total seconds" />
								</div>
								<input name="topic" placeholder="Topic (optional)" class="input mt-2 py-1.5 text-xs" />
								<button class="btn btn-brass focus-ring mt-2 w-full py-2 text-xs">Start</button>
							</form>
						{/if}

						<!-- Vote -->
						{#if !vote}
							<form method="POST" action="?/openVote" use:enhance={refresh} class="rounded-lg border border-white/[0.07] p-3">
								<p class="label mb-2 text-[0.6rem]">Open a vote</p>
								<input name="label" placeholder="Question put to the floor…" class="input py-1.5 text-xs" />
								<select name="majorityRule" class="input mt-2 py-1.5 text-xs">
									<option value="simple">Simple majority</option>
									<option value="two_thirds">Two-thirds majority</option>
								</select>
								<button class="btn btn-brass focus-ring mt-2 w-full py-2 text-xs">Open vote</button>
							</form>
						{/if}

						<!-- Session status -->
						<div>
							<p class="label mt-1 mb-2 text-[0.6rem]">Session</p>
							<div class="grid grid-cols-3 gap-2">
								{#each [['in_session', 'Open'], ['suspended', 'Suspend'], ['closed', 'Close']] as [value, text] (value)}
									<form method="POST" action="?/setStatus" use:enhance={refresh}>
										<input type="hidden" name="status" {value} />
										<button class="btn focus-ring w-full py-2 text-xs {cstatus === value ? 'btn-ghost border-brass-600/50 text-brass-300' : 'btn-quiet'}">{text}</button>
									</form>
								{/each}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</aside>
	</div>
</div>
