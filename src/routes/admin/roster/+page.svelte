<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let csv = $state('');

	const placeholder = `name, country, committee, role
Amara Okafor, Nigeria, unsc, delegate
Jonas Berg, Norway, Disarmament Committee, chair
Mei Tanaka, Japan, unsc`;

	const validCount = $derived(form?.preview ? form.preview.filter((r) => !r.error).length : 0);
	const problemCount = $derived(form?.preview ? form.preview.filter((r) => r.error).length : 0);
</script>

<svelte:head><title>Roster import — MIMUN 2026</title></svelte:head>

<div class="mx-auto max-w-3xl px-6 py-10">
	<h1 class="display text-3xl text-ink-50">Roster import</h1>
	<p class="label mt-2 text-ink-400">
		Format: <span class="font-mono text-brass-400">name, country, committee, role</span> — role optional (defaults to
		delegate), committee = name or slug.
	</p>

	{#if data.committees.length === 0}
		<p class="mt-4 rounded-lg border border-white/[0.07] bg-signal-red/10 px-3 py-2 text-sm text-signal-red">
			No committees exist yet. Create committees before importing a roster.
		</p>
	{/if}

	<form method="POST" use:enhance class="mt-6">
		<textarea
			name="csv"
			bind:value={csv}
			rows="10"
			spellcheck="false"
			placeholder={placeholder}
			class="input focus-ring w-full resize-y font-mono text-sm leading-relaxed"
		></textarea>

		{#if form?.message}
			<p class="mt-2 text-sm text-signal-red">{form.message}</p>
		{/if}

		<div class="mt-3 flex items-center gap-2">
			<button formaction="?/preview" class="btn btn-ghost focus-ring px-4 py-2 text-sm" disabled={!csv.trim()}>
				Preview
			</button>
			<button
				formaction="?/import"
				class="btn btn-brass focus-ring px-4 py-2 text-sm"
				disabled={!csv.trim() || data.committees.length === 0}
			>
				Import
			</button>
		</div>
	</form>

	<!-- Preview: parsed rows, problems flagged in red. -->
	{#if form?.preview}
		<section class="mt-8">
			<div class="mb-3 flex items-baseline gap-3">
				<p class="label text-ink-400">Preview</p>
				<p class="text-sm text-ink-300">
					<span class="text-signal-green">{validCount} valid</span>
					<span class="text-ink-500"> · </span>
					<span class={problemCount ? 'text-signal-red' : 'text-ink-400'}>{problemCount} problems</span>
				</p>
			</div>

			<div class="card overflow-hidden p-0">
				<table class="w-full text-left text-sm">
					<thead>
						<tr class="border-b border-white/[0.07] text-ink-400">
							<th class="label px-4 py-2.5 font-normal">Name</th>
							<th class="label px-4 py-2.5 font-normal">Country</th>
							<th class="label px-4 py-2.5 font-normal">Committee</th>
							<th class="label px-4 py-2.5 font-normal">Role</th>
						</tr>
					</thead>
					<tbody>
						{#each form.preview as row, i (i)}
							<tr class="border-b border-white/[0.07] last:border-0 {row.error ? 'bg-signal-red/10' : ''}">
								{#if row.error}
									<td class="px-4 py-2.5 text-ink-100">{row.fullName || '—'}</td>
									<td class="px-4 py-2.5 text-ink-300" colspan="3">
										<span class="text-signal-red">{row.error}</span>
									</td>
								{:else}
									<td class="px-4 py-2.5 text-ink-100">{row.fullName}</td>
									<td class="px-4 py-2.5 text-ink-300">{row.country || '—'}</td>
									<td class="px-4 py-2.5 text-ink-300">{row.committeeName}</td>
									<td class="px-4 py-2.5 font-mono text-xs text-brass-400">{row.role}</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<!-- Import result: minted delegates with their invite codes. -->
	{#if form?.imported}
		<section class="mt-8">
			<div class="mb-3 flex items-baseline gap-3">
				<p class="label text-ink-400">Imported</p>
				<p class="text-sm text-ink-300">
					<span class="text-signal-green">{form.imported.length} added</span>
					{#if form.skipped}<span class="text-ink-500"> · </span><span class="text-ink-400">{form.skipped} skipped</span>{/if}
				</p>
			</div>

			{#if form.imported.length === 0}
				<div class="card text-sm text-ink-400">
					Nothing was imported — every row had a problem. Run Preview to see why.
				</div>
			{:else}
				<div class="card overflow-hidden p-0">
					<table class="w-full text-left text-sm">
						<thead>
							<tr class="border-b border-white/[0.07] text-ink-400">
								<th class="label px-4 py-2.5 font-normal">Name</th>
								<th class="label px-4 py-2.5 font-normal">Committee</th>
								<th class="label px-4 py-2.5 font-normal">Invite code</th>
							</tr>
						</thead>
						<tbody>
							{#each form.imported as d, i (i)}
								<tr class="border-b border-white/[0.07] last:border-0">
									<td class="px-4 py-2.5 text-ink-100">{d.fullName}</td>
									<td class="px-4 py-2.5 text-ink-300">{d.committeeName}</td>
									<td class="px-4 py-2.5 font-mono text-brass-400">{d.inviteCode}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<p class="mt-2 text-xs text-ink-500">Print the invite cards to distribute these codes.</p>
			{/if}
		</section>
	{/if}
</div>
