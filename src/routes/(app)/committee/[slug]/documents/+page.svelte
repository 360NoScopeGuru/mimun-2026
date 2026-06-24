<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const kindLabel: Record<string, string> = {
		background_guide: 'Background guide',
		rop: 'Rules of procedure',
		agenda: 'Agenda',
		study_guide: 'Study guide',
		other: 'Document'
	};

	function fmtSize(b: number): string {
		return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<svelte:head><title>Documents — {data.committee.name}</title></svelte:head>

<div class="surface-paper min-h-[calc(100vh-57px)]">
	<div class="flex items-center justify-between border-b border-paper-line px-6 py-3">
		<a href="/committee/{data.committee.slug}" class="text-sm text-paper-ink-500 transition-colors hover:text-paper-ink-900">← {data.committee.name}</a>
		<p class="label text-paper-ink-500">Committee documents</p>
	</div>

	<div class="mx-auto max-w-3xl px-6 py-8">
		{#if form?.message}
			<p class="mb-4 rounded-lg bg-red-700/10 px-3 py-2 text-sm text-red-800">{form.message}</p>
		{/if}

		<!-- Committee documents -->
		<section>
			<h1 class="display text-3xl text-paper-ink-900">Documents</h1>
			<p class="mt-1 text-sm text-paper-ink-500">Background guide, rules of procedure, agenda and other official papers.</p>

			<ul class="mt-5 divide-y divide-paper-line border-y border-paper-line">
				{#each data.documents as doc (doc.id)}
					<li class="flex items-center gap-3 py-3">
						<div class="min-w-0 flex-1">
							<a href="/files/{doc.id}" target="_blank" rel="noopener" class="text-sm font-medium text-paper-ink-900 hover:text-paper-brass">{doc.title || doc.fileName}</a>
							<p class="text-xs text-paper-ink-500"><span class="text-paper-brass">{kindLabel[doc.kind] ?? 'Document'}</span> · {doc.fileName} · {fmtSize(doc.sizeBytes)}</p>
						</div>
						<a href="/files/{doc.id}" target="_blank" rel="noopener" class="btn btn-brass focus-ring px-3 py-1.5 text-xs">Open</a>
						{#if data.isChair}
							<form method="POST" action="?/deleteFile" use:enhance><input type="hidden" name="fileId" value={doc.id} /><button class="focus-ring rounded-lg border border-paper-line px-3 py-1.5 text-xs text-paper-ink-700 hover:bg-paper-100">Remove</button></form>
						{/if}
					</li>
				{:else}
					<li class="py-4 text-sm text-paper-ink-500">No documents posted yet.</li>
				{/each}
			</ul>

			{#if data.isChair}
				<form method="POST" action="?/uploadDocument" enctype="multipart/form-data" use:enhance class="mt-4 rounded-xl border border-paper-line bg-paper-100/60 p-4">
					<p class="label mb-2 text-paper-ink-500">Post a document</p>
					<div class="flex flex-wrap gap-2">
						<select name="kind" class="rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 focus:border-paper-brass focus:outline-none">
							<option value="background_guide">Background guide</option>
							<option value="rop">Rules of procedure</option>
							<option value="agenda">Agenda</option>
							<option value="study_guide">Study guide</option>
							<option value="other">Other</option>
						</select>
						<input name="title" placeholder="Title (optional)" class="flex-1 rounded-lg border border-paper-line bg-paper-50 px-3 py-2 text-sm text-paper-ink-900 placeholder:text-paper-ink-500 focus:border-paper-brass focus:outline-none" />
					</div>
					<input type="file" name="file" required class="mt-2 block w-full text-sm text-paper-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-paper-brass file:px-3 file:py-1.5 file:text-xs file:text-paper-50" />
					<button class="btn btn-brass focus-ring mt-3 py-2 text-xs">Upload</button>
				</form>
			{/if}
		</section>

		<!-- Position papers -->
		<section class="mt-10">
			<h2 class="display text-2xl text-paper-ink-900">Position papers</h2>

			{#if data.isChair}
				<p class="mt-1 text-sm text-paper-ink-500">Submitted by the delegations of this committee.</p>
				<ul class="mt-4 divide-y divide-paper-line border-y border-paper-line">
					{#each data.allPapers as p (p.id)}
						<li class="flex items-center gap-3 py-3">
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-paper-ink-900">{p.country || p.author}</p>
								<p class="text-xs text-paper-ink-500">{p.fileName} · {fmtSize(p.sizeBytes)}</p>
							</div>
							<a href="/files/{p.id}" target="_blank" rel="noopener" class="btn btn-brass focus-ring px-3 py-1.5 text-xs">Open</a>
						</li>
					{:else}
						<li class="py-4 text-sm text-paper-ink-500">No position papers submitted yet.</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-1 text-sm text-paper-ink-500">Submit your delegation's position paper to the dais.</p>
				{#if data.myPaper}
					<div class="mt-4 flex items-center gap-3 rounded-lg border border-paper-line bg-paper-100/60 px-4 py-3">
						<div class="flex-1">
							<p class="text-sm font-medium text-paper-ink-900">Submitted</p>
							<p class="text-xs text-paper-ink-500">{data.myPaper.fileName} · {fmtSize(data.myPaper.sizeBytes)}</p>
						</div>
						<a href="/files/{data.myPaper.id}" target="_blank" rel="noopener" class="btn btn-brass focus-ring px-3 py-1.5 text-xs">Open</a>
					</div>
				{/if}
				<form method="POST" action="?/uploadPositionPaper" enctype="multipart/form-data" use:enhance class="mt-3 rounded-xl border border-paper-line bg-paper-100/60 p-4">
					<p class="label mb-2 text-paper-ink-500">{data.myPaper ? 'Replace your paper' : 'Submit your paper'}</p>
					<input type="file" name="file" required class="block w-full text-sm text-paper-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-paper-brass file:px-3 file:py-1.5 file:text-xs file:text-paper-50" />
					<button class="btn btn-brass focus-ring mt-3 py-2 text-xs">{data.myPaper ? 'Replace' : 'Submit'}</button>
				</form>
			{/if}
		</section>

		<!-- Adopted resolutions archive -->
		{#if data.adopted.length}
			<section class="mt-10">
				<h2 class="display text-2xl text-paper-ink-900">Adopted resolutions</h2>
				<ul class="mt-4 divide-y divide-paper-line border-y border-paper-line">
					{#each data.adopted as r (r.id)}
						<li class="flex items-center gap-3 py-3">
							{#if r.designation}<span class="font-mono text-xs text-paper-brass">{r.designation}</span>{/if}
							<a href="/committee/{data.committee.slug}/resolutions?id={r.id}" class="flex-1 text-sm text-paper-ink-900 hover:text-paper-brass">{r.title}</a>
							<span class="signature text-xl text-paper-brass">adopted</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
</div>
