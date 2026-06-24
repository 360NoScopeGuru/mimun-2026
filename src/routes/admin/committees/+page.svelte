<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Committee = PageData['committees'][number];

	const statusLabel: Record<string, string> = {
		pending: 'Pending',
		in_session: 'In session',
		suspended: 'Suspended',
		closed: 'Closed'
	};
	const statusPill: Record<string, string> = {
		pending: 'border-white/[0.12] text-ink-300',
		in_session: 'border-signal-green/40 text-signal-green',
		suspended: 'border-signal-amber/40 text-signal-amber',
		closed: 'border-signal-red/40 text-signal-red'
	};

	// Group committees by conference, preserving conference order from `data.conferences`.
	const groups = $derived(
		data.conferences
			.map((conf) => ({
				conference: conf,
				committees: data.committees.filter((c) => c.conferenceId === conf.id)
			}))
			.filter((g) => g.committees.length > 0)
	);

	const orphans = $derived(
		data.committees.filter((c) => !data.conferences.some((conf) => conf.id === c.conferenceId))
	);
</script>

<svelte:head><title>Committees — Secretariat</title></svelte:head>

<div class="mx-auto max-w-4xl px-6 py-10">
	<header class="mb-8">
		<p class="label-brass label">Conference setup</p>
		<h1 class="display mt-1 text-3xl text-ink-50">Committees</h1>
		<p class="mt-2 max-w-prose text-sm text-ink-400">
			Create committees, set their agenda and rules preset, and manage their lifecycle status.
		</p>
	</header>

	{#if form?.message}
		<p class="mb-6 rounded-lg border border-signal-red/40 bg-signal-red/10 px-4 py-2.5 text-sm text-signal-red">
			{form.message}
		</p>
	{/if}

	<!-- New committee -->
	<section class="card mb-10 p-6">
		<p class="label mb-4 text-ink-300">New committee</p>
		<form method="POST" action="?/createCommittee" use:enhance class="grid gap-4 sm:grid-cols-2">
			<label class="block sm:col-span-2">
				<span class="label mb-1.5 block text-ink-400">Conference</span>
				<select name="conferenceId" class="input" required>
					{#if data.conferences.length === 0}
						<option value="" disabled selected>No conferences yet</option>
					{/if}
					{#each data.conferences as conf (conf.id)}
						<option value={conf.id}>{conf.name}</option>
					{/each}
				</select>
			</label>

			<label class="block">
				<span class="label mb-1.5 block text-ink-400">Name</span>
				<input name="name" class="input" placeholder="General Assembly First Committee" required />
			</label>

			<label class="block">
				<span class="label mb-1.5 block text-ink-400">Slug</span>
				<input name="slug" class="input font-mono" placeholder="ga-first" required />
			</label>

			<label class="block sm:col-span-2">
				<span class="label mb-1.5 block text-ink-400">Topic</span>
				<input name="topic" class="input" placeholder="Disarmament & international security" />
			</label>

			<label class="block sm:col-span-2">
				<span class="label mb-1.5 block text-ink-400">Agenda</span>
				<textarea name="agenda" rows="3" class="input" placeholder="One agenda issue per line"></textarea>
			</label>

			<label class="block">
				<span class="label mb-1.5 block text-ink-400">Rules preset</span>
				<select name="preset" class="input">
					{#each data.presets as preset (preset)}
						<option value={preset}>{preset}</option>
					{/each}
				</select>
			</label>

			<div class="flex items-end sm:col-span-2">
				<button type="submit" class="btn btn-brass focus-ring">Create committee</button>
			</div>
		</form>
	</section>

	<!-- Committees list -->
	{#if data.committees.length === 0}
		<div class="card flex flex-col items-center px-6 py-16 text-center">
			<span class="emblem mb-4 h-10 w-10 rounded-lg text-base">M</span>
			<p class="display text-xl text-ink-100">No committees yet</p>
			<p class="mt-1.5 max-w-sm text-sm text-ink-400">
				Create your first committee above to begin building out the conference.
			</p>
		</div>
	{:else}
		<div class="space-y-10">
			{#each groups as group (group.conference.id)}
				<section>
					<div class="mb-3 flex items-baseline justify-between">
						<h2 class="label text-brass-400">{group.conference.name}</h2>
						<span class="text-xs text-ink-500 tabular-nums">{group.committees.length} committees</span>
					</div>
					<div class="space-y-3">
						{#each group.committees as committee (committee.id)}
							{@render committeeRow(committee)}
						{/each}
					</div>
				</section>
			{/each}

			{#if orphans.length > 0}
				<section>
					<h2 class="label mb-3 text-ink-400">Unassigned</h2>
					<div class="space-y-3">
						{#each orphans as committee (committee.id)}
							{@render committeeRow(committee)}
						{/each}
					</div>
				</section>
			{/if}
		</div>
	{/if}
</div>

{#snippet committeeRow(committee: Committee)}
	<details class="card group overflow-hidden">
		<summary class="flex cursor-pointer list-none items-start gap-4 px-5 py-4">
			<div class="min-w-0 flex-1">
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span class="display text-lg text-ink-50">{committee.name}</span>
					<span class="font-mono text-xs text-ink-500">{committee.slug}</span>
				</div>
				{#if committee.topic}
					<p class="mt-0.5 truncate text-sm text-ink-400">{committee.topic}</p>
				{/if}
			</div>
			<div class="flex shrink-0 flex-col items-end gap-1.5">
				<span class="rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium {statusPill[committee.status] ?? statusPill.pending}">
					{statusLabel[committee.status] ?? committee.status}
				</span>
				<span class="text-xs text-ink-500 tabular-nums">{committee.delegates} delegates</span>
			</div>
			<span class="mt-1 shrink-0 text-ink-500 transition-transform group-open:rotate-90" aria-hidden="true">›</span>
		</summary>

		<div class="border-t border-white/[0.07] px-5 py-5">
			<form method="POST" action="?/updateCommittee" use:enhance class="grid gap-4 sm:grid-cols-2">
				<input type="hidden" name="id" value={committee.id} />

				<label class="block">
					<span class="label mb-1.5 block text-ink-400">Name</span>
					<input name="name" class="input" value={committee.name} required />
				</label>

				<label class="block">
					<span class="label mb-1.5 block text-ink-400">Status</span>
					<select name="status" class="input" value={committee.status}>
						<option value="pending">Pending</option>
						<option value="in_session">In session</option>
						<option value="suspended">Suspended</option>
						<option value="closed">Closed</option>
					</select>
				</label>

				<label class="block sm:col-span-2">
					<span class="label mb-1.5 block text-ink-400">Topic</span>
					<input name="topic" class="input" value={committee.topic} />
				</label>

				<label class="block sm:col-span-2">
					<span class="label mb-1.5 block text-ink-400">Agenda</span>
					<textarea name="agenda" rows="3" class="input" placeholder="One agenda issue per line">{committee.agenda.join('\n')}</textarea>
				</label>

				<label class="block">
					<span class="label mb-1.5 block text-ink-400">Rules preset</span>
					<select name="preset" class="input" value={committee.preset}>
						{#each data.presets as preset (preset)}
							<option value={preset}>{preset}</option>
						{/each}
					</select>
				</label>

				<div class="flex items-end gap-3 sm:col-span-2">
					<button type="submit" class="btn btn-brass focus-ring">Save changes</button>
					<a href="/committee/{committee.slug}" class="btn btn-ghost focus-ring">Open floor</a>
				</div>
			</form>
		</div>
	</details>
{/snippet}
