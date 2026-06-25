<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const others = (id: string) => data.items.filter((i) => i.id !== id);
</script>

<svelte:head><title>Lobbying — {data.committee.name}</title></svelte:head>

<div class="surface-paper min-h-[calc(100vh-57px)]">
	<div class="flex items-center justify-between border-b border-paper-line px-6 py-3">
		<a href="/committee/{data.committee.slug}" class="text-sm text-paper-ink-500 transition-colors hover:text-paper-ink-900">← {data.committee.name}</a>
		<p class="label text-paper-ink-500">Lobbying &amp; merging</p>
	</div>

	<div class="mx-auto max-w-3xl px-6 py-8">
		<h1 class="letterpress display text-3xl text-paper-ink-900">Lobbying</h1>
		<p class="mt-1 text-sm text-paper-ink-500">Form blocs, co-sponsor drafts, and merge working papers before they go to the dais.</p>

		{#if form?.message}<p class="mt-4 rounded-lg bg-red-700/10 px-3 py-2 text-sm text-red-800">{form.message}</p>{/if}

		<div class="mt-6 space-y-4">
			{#each data.items as r (r.id)}
				<article class="rounded-xl border border-paper-line bg-paper-50 p-5 shadow-[0_8px_20px_-12px_rgba(60,50,30,0.3)]">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<h2 class="letterpress display text-lg text-paper-ink-900">{r.title}</h2>
							{#if r.agendaIssue}<p class="text-xs text-paper-ink-500">{r.agendaIssue}</p>{/if}
						</div>
						<a href="/committee/{data.committee.slug}/resolutions?id={r.id}" class="shrink-0 font-mono text-xs text-paper-brass hover:underline">{r.clauses} clauses →</a>
					</div>

					<div class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-paper-ink-500">
						<span><span class="text-paper-ink-700">Main submitter</span> {r.mainSubmitter}</span>
						{#if r.coSubmitters.length}<span><span class="text-paper-ink-700">Co-submitters</span> {r.coSubmitters.join(', ')}</span>{/if}
					</div>

					<div class="mt-4 border-t border-paper-line pt-3">
						{#if r.isMine}
							{#if others(r.id).length}
								<form method="POST" action="?/mergeInto" use:enhance class="flex flex-wrap items-center gap-2">
									<input type="hidden" name="sourceId" value={r.id} />
									<span class="text-xs text-paper-ink-500">Merge this draft into</span>
									<select name="targetId" class="rounded-lg border border-paper-line bg-paper-50 px-2 py-1.5 text-sm text-paper-ink-900 focus:border-paper-brass focus:outline-none">
										{#each others(r.id) as o (o.id)}<option value={o.id}>{o.title}</option>{/each}
									</select>
									<button class="btn btn-brass focus-ring px-3 py-1.5 text-xs">Merge</button>
								</form>
							{:else}
								<p class="text-xs text-paper-ink-500">Your draft — no other drafts to merge into yet.</p>
							{/if}
						{:else if r.amSponsor}
							<span class="text-xs text-paper-brass">✓ You are co-sponsoring this draft.</span>
						{:else}
							<form method="POST" action="?/coSponsor" use:enhance>
								<input type="hidden" name="resolutionId" value={r.id} />
								<button class="btn btn-brass focus-ring px-3 py-1.5 text-xs">Co-sponsor</button>
							</form>
						{/if}
					</div>
				</article>
			{:else}
				<p class="rounded-xl border border-dashed border-paper-line px-4 py-10 text-center text-sm text-paper-ink-500">
					No drafts in lobbying. Begin one from the <a href="/committee/{data.committee.slug}/resolutions" class="text-paper-brass hover:underline">resolutions room</a>.
				</p>
			{/each}
		</div>
	</div>
</div>
