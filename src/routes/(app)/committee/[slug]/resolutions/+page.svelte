<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const sel = $derived(data.selected);

	const roleLabel: Record<string, string> = { main_submitter: 'Main submitter', co_submitter: 'Co-submitter', signatory: 'Signatory' };
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
