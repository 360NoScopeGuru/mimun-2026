<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import AiFeedback from '$lib/components/AiFeedback.svelte';
	import type { Feedback } from '$lib/feedback';

	let { data }: { data: PageData } = $props();
	const sel = $derived(data.selected);

	// AI draft review
	let feedback = $state<Feedback | null>(null);
	let feedbackProvider = $state('');
	let reviewing = $state(false);
	let reviewError = $state('');

	async function requestFeedback() {
		if (!sel || reviewing) return;
		reviewing = true;
		reviewError = '';
		feedback = null;
		try {
			const res = await fetch(`/committee/${data.committee.slug}/resolutions/feedback`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ resolutionId: sel.id })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) reviewError = body.message || 'Could not generate feedback right now.';
			else {
				feedback = body.feedback;
				feedbackProvider = body.provider;
			}
		} catch {
			reviewError = 'Could not reach the reviewer.';
		} finally {
			reviewing = false;
		}
	}

	// Clear stale feedback when switching to a different draft.
	$effect(() => {
		sel?.id;
		feedback = null;
		feedbackProvider = '';
		reviewError = '';
	});

	const roleLabel: Record<string, string> = { main_submitter: 'Main submitter', co_submitter: 'Co-submitter', signatory: 'Signatory' };

	const statusText: Record<string, string> = {
		lobbying: 'Lobbying',
		submitted: 'Awaiting approval',
		approved: 'Approved',
		on_floor: 'On the floor',
		adopted: 'Adopted',
		failed: 'Failed',
		withdrawn: 'Withdrawn'
	};
	const statusColor: Record<string, string> = {
		lobbying: 'bg-paper-200 text-paper-ink-700',
		submitted: 'bg-paper-200 text-paper-ink-700',
		approved: 'bg-paper-brass/15 text-paper-brass',
		on_floor: 'bg-paper-brass/15 text-paper-brass',
		adopted: 'bg-green-700/15 text-green-800',
		failed: 'bg-red-700/15 text-red-800',
		withdrawn: 'bg-paper-200 text-paper-ink-500'
	};
</script>

<svelte:head><title>Resolutions — {data.committee.name}</title></svelte:head>

<div class="surface-paper min-h-[calc(100vh-57px)]">
	<!-- top bar -->
	<div class="flex items-center justify-between border-b border-paper-line px-6 py-3">
		<a href="/committee/{data.committee.slug}" class="text-sm text-paper-ink-500 transition-colors hover:text-paper-ink-900">← {data.committee.name}</a>
		<p class="label text-paper-ink-500">Draft resolutions</p>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-[260px_1fr]">
		<!-- list + new draft -->
		<aside class="border-r border-paper-line px-4 py-5">
			<p class="label mb-3 text-paper-ink-500">On the agenda</p>
			<ul class="space-y-1">
				{#each data.list as r (r.id)}
					<li>
						<a
							href="?id={r.id}"
							class="block rounded-lg px-3 py-2 transition-colors hover:bg-paper-100 {sel?.id === r.id ? 'bg-paper-100' : ''}"
						>
							<div class="flex items-center gap-2">
								{#if r.designation}<span class="font-mono text-[0.65rem] text-paper-brass">{r.designation}</span>{/if}
								<span class="text-[0.6rem] text-paper-ink-500 uppercase">{r.status}</span>
							</div>
							<p class="mt-0.5 line-clamp-2 text-sm text-paper-ink-900">{r.title}</p>
						</a>
					</li>
				{:else}
					<li class="px-3 py-2 text-sm text-paper-ink-500">No drafts yet.</li>
				{/each}
			</ul>

			<form method="POST" action="?/createDraft" use:enhance class="mt-5 border-t border-paper-line pt-4">
				<p class="label mb-2 text-paper-ink-500">New draft</p>
				<input name="title" placeholder="Resolution title" class="w-full rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 placeholder:text-paper-ink-500 focus:border-paper-brass focus:outline-none" />
				<input name="agendaIssue" placeholder="Agenda issue (optional)" class="mt-2 w-full rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 placeholder:text-paper-ink-500 focus:border-paper-brass focus:outline-none" />
				<button class="btn btn-brass focus-ring mt-2 w-full py-2 text-xs">Begin draft</button>
			</form>
		</aside>

		<!-- the document -->
		<main class="px-6 py-8 lg:px-12">
			{#if sel}
				<article class="mx-auto max-w-2xl">
					<div class="mb-1 flex items-center gap-2">
						{#if sel.designation}<span class="rounded border border-paper-brass/40 px-1.5 py-0.5 font-mono text-[0.65rem] text-paper-brass">{sel.designation}</span>{/if}
						<span class="text-[0.65rem] text-paper-ink-500 uppercase">{sel.status}</span>
					</div>
					<h1 class="display text-3xl text-paper-ink-900">{sel.title}</h1>
					{#if sel.agendaIssue}<p class="mt-2 text-sm text-paper-ink-500">Agenda issue — {sel.agendaIssue}</p>{/if}

					<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-paper-ink-500">
						{#if sel.mainSubmitter}<span><span class="text-paper-ink-700">Submitted by</span> {sel.mainSubmitter.country || sel.mainSubmitter.name}</span>{/if}
						{#if sel.sponsors.filter((s) => s.role !== 'main_submitter').length}
							<span><span class="text-paper-ink-700">Co-submitters</span>
								{sel.sponsors.filter((s) => s.role !== 'main_submitter').map((s) => s.country || s.name).join(', ')}</span>
						{/if}
					</div>

					<!-- lifecycle / approval panel -->
					<div class="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-paper-line bg-paper-100/60 px-3 py-2">
						<span class="label text-paper-ink-500">Status</span>
						<span class="rounded px-2 py-0.5 text-xs font-medium {statusColor[sel.status]}">{statusText[sel.status] ?? sel.status}</span>
						<div class="ml-auto flex flex-wrap gap-2">
							{#if sel.status === 'lobbying' && (sel.isMainSubmitter || sel.canApprove)}
								<form method="POST" action="?/submitResolution" use:enhance>
									<input type="hidden" name="resolutionId" value={sel.id} />
									<button class="btn btn-brass focus-ring px-3 py-1.5 text-xs">Submit for approval</button>
								</form>
							{:else if sel.status === 'submitted' && sel.canApprove}
								<form method="POST" action="?/approveResolution" use:enhance>
									<input type="hidden" name="resolutionId" value={sel.id} />
									<button class="btn btn-brass focus-ring px-3 py-1.5 text-xs">Approve &amp; assign designation</button>
								</form>
								<form method="POST" action="?/returnResolution" use:enhance>
									<input type="hidden" name="resolutionId" value={sel.id} />
									<button class="focus-ring rounded-lg border border-paper-line px-3 py-1.5 text-xs text-paper-ink-700 transition-colors hover:bg-paper-100">Return</button>
								</form>
							{:else if sel.status === 'submitted'}
								<span class="text-xs text-paper-ink-500">Awaiting the dais.</span>
							{:else if sel.status === 'approved'}
								<span class="text-xs text-paper-ink-500">Ready — introduce it from the committee room.</span>
							{/if}
						</div>
					</div>

					{#if sel.status === 'adopted'}
						<div class="mt-5 flex items-end justify-between border-t border-paper-line pt-4">
							<span class="signature text-4xl leading-none text-paper-brass">Adopted by the committee</span>
							{#if sel.designation}<span class="font-mono text-xs text-paper-ink-500">Res. {sel.designation}</span>{/if}
						</div>
					{/if}

					<hr class="my-6 border-paper-line" />

					<!-- Preambulatory clauses -->
					<div class="space-y-3 text-paper-ink-900">
						{#each sel.preambulatory as c (c.id)}
							<p class="leading-relaxed italic" style="font-family: var(--font-display)">{c.text}</p>
						{/each}
					</div>

					<!-- Operative clauses -->
					<ol class="mt-5 space-y-3">
						{#each sel.operative as c, i (c.id)}
							<li class="flex gap-3 leading-relaxed text-paper-ink-900">
								<span class="font-mono text-sm text-paper-brass tabular-nums">{i + 1}.</span>
								<span>{c.text}</span>
							</li>
						{/each}
					</ol>

					{#if sel.preambulatory.length === 0 && sel.operative.length === 0}
						<p class="text-sm text-paper-ink-500">This draft has no clauses yet.</p>
					{/if}

					<!-- AI draft review -->
					{#if data.aiConfigured && (sel.preambulatory.length > 0 || sel.operative.length > 0)}
						<div class="mt-6 border-t border-paper-line pt-4">
							{#if reviewing}
								<p class="text-sm text-paper-ink-500">Reviewing the draft against THIMUN form and substance…</p>
							{:else if feedback}
								<AiFeedback {feedback} provider={feedbackProvider} />
								<button
									type="button"
									onclick={requestFeedback}
									class="focus-ring mt-3 rounded-lg border border-paper-line px-3 py-1.5 text-xs text-paper-ink-700 hover:bg-paper-100"
								>
									Review again
								</button>
							{:else}
								<button
									type="button"
									onclick={requestFeedback}
									class="focus-ring rounded-lg border border-paper-line px-3 py-1.5 text-xs text-paper-ink-700 hover:bg-paper-100"
								>
									Ask the parliamentarian to review this draft
								</button>
								{#if reviewError}<p class="mt-2 text-sm text-[color:var(--color-signal-red)]">{reviewError}</p>{/if}
							{/if}
						</div>
					{/if}

					<!-- amendments -->
					{#if sel.amendments.length}
						<div class="mt-8">
							<p class="label mb-2 text-paper-ink-500">Amendments</p>
							<ul class="space-y-2">
								{#each sel.amendments as a (a.id)}
									<li class="rounded-lg border border-paper-line bg-paper-100/50 px-3 py-2.5">
										<div class="flex items-center gap-2 text-[0.65rem] uppercase">
											<span class={a.type === 'unfriendly' ? 'text-red-800' : 'text-paper-brass'}>{a.type}</span>
											<span class="text-paper-ink-500">· {a.action}</span>
											<span class="ml-auto text-paper-ink-500">{a.status}</span>
										</div>
										<p class="mt-1 text-sm text-paper-ink-900">{a.text || '(strike the clause)'}</p>
										<p class="text-xs text-paper-ink-500">{a.proposerCountry || a.proposer}</p>
										{#if a.status === 'proposed'}
											<div class="mt-2 flex flex-wrap gap-2">
												{#if a.type === 'friendly' && (sel.isMainSubmitter || sel.canApprove)}
													<form method="POST" action="?/acceptAmendment" use:enhance><input type="hidden" name="amendmentId" value={a.id} /><button class="btn btn-brass focus-ring px-3 py-1 text-[0.7rem]">Accept</button></form>
												{/if}
												{#if a.type === 'unfriendly' && sel.canApprove}
													<form method="POST" action="?/voteAmendment" use:enhance><input type="hidden" name="amendmentId" value={a.id} /><button class="btn btn-brass focus-ring px-3 py-1 text-[0.7rem]">Put to vote</button></form>
												{/if}
												{#if sel.isMainSubmitter || sel.canApprove}
													<form method="POST" action="?/rejectAmendment" use:enhance><input type="hidden" name="amendmentId" value={a.id} /><button class="focus-ring rounded-lg border border-paper-line px-3 py-1 text-[0.7rem] text-paper-ink-700 hover:bg-paper-100">Reject</button></form>
												{/if}
											</div>
										{:else if a.status === 'voting'}
											<p class="mt-1 text-xs text-paper-brass">On the floor for a vote.</p>
										{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}

					<!-- propose amendment -->
					<details class="mt-6 rounded-xl border border-paper-line bg-paper-100/40 p-4">
						<summary class="cursor-pointer text-sm text-paper-brass">Propose an amendment</summary>
						<form method="POST" action="?/proposeAmendment" use:enhance={() => async ({ update }) => update({ reset: true })} class="mt-3 space-y-2">
							<input type="hidden" name="resolutionId" value={sel.id} />
							<div class="flex gap-2">
								<select name="type" class="rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 focus:border-paper-brass focus:outline-none">
									<option value="friendly">Friendly</option>
									<option value="unfriendly">Unfriendly</option>
								</select>
								<select name="action" class="rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 focus:border-paper-brass focus:outline-none">
									<option value="amend">Amend a clause</option>
									<option value="strike">Strike a clause</option>
									<option value="add">Add a clause</option>
								</select>
							</div>
							<select name="targetClauseId" class="w-full rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 focus:border-paper-brass focus:outline-none">
								<option value="">— target clause (for amend / strike) —</option>
								{#each sel.preambulatory as c, i (c.id)}<option value={c.id}>Preamble {i + 1}</option>{/each}
								{#each sel.operative as c, i (c.id)}<option value={c.id}>Operative {i + 1}</option>{/each}
							</select>
							<textarea name="text" rows="2" placeholder="New clause text (for amend / add)…" class="w-full rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 placeholder:text-paper-ink-500 focus:border-paper-brass focus:outline-none"></textarea>
							<button class="btn btn-brass focus-ring py-2 text-xs">Submit amendment</button>
						</form>
					</details>

					<!-- add clause -->
					{#if sel.canEdit}
						<form method="POST" action="?/addClause" use:enhance={() => async ({ update }) => update({ reset: true })} class="mt-8 rounded-xl border border-paper-line bg-paper-100/60 p-4">
							<p class="label mb-2 text-paper-ink-500">Add a clause</p>
							<input type="hidden" name="resolutionId" value={sel.id} />
							<select name="kind" class="rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 focus:border-paper-brass focus:outline-none">
								<option value="preambulatory">Preambulatory</option>
								<option value="operative">Operative</option>
							</select>
							<textarea name="text" rows="2" placeholder="Clause text…" class="mt-2 w-full rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 placeholder:text-paper-ink-500 focus:border-paper-brass focus:outline-none"></textarea>
							<button class="btn btn-brass focus-ring mt-2 py-2 text-xs">Add clause</button>
						</form>
					{/if}
				</article>
			{:else}
				<div class="mx-auto max-w-md py-20 text-center">
					<p class="display text-2xl text-paper-ink-900">No resolution selected</p>
					<p class="mt-2 text-sm text-paper-ink-500">Choose a draft on the left, or begin a new one.</p>
				</div>
			{/if}
		</main>
	</div>
</div>
