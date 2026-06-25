<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const roleLabel: Record<string, string> = {
		delegate: 'Delegate',
		chair: 'Chair',
		deputy_chair: 'Deputy Chair',
		admin: 'Secretariat',
		secretariat: 'Secretariat'
	};

	const role = $derived(roleLabel[data.delegate.role] ?? 'Delegate');
	const firstName = $derived(data.delegate.fullName.trim().split(/\s+/)[0] || data.delegate.fullName);
</script>

<svelte:head><title>My conference — MIMUN 2026</title></svelte:head>

<div class="mx-auto max-w-3xl px-6 py-12 sm:py-16">
	<!-- Welcome header -->
	<header>
		<p class="label label-brass">My conference</p>
		<h1 class="display mt-2 text-3xl text-ink-50 sm:text-4xl">Welcome, {firstName}.</h1>
		<p class="mt-3 text-sm text-ink-400">
			<span class="text-ink-200">{data.delegate.fullName}</span>
			{#if data.delegate.country}
				· {data.delegate.country}
			{/if}
			· {role}
		</p>
	</header>

	{#if data.committee}
		<!-- Seated: committee hub card -->
		<section class="card mt-10 p-7 sm:p-8">
			<div class="flex items-start justify-between gap-4">
				<div class="min-w-0">
					<p class="label text-ink-500">Your committee</p>
					<h2 class="display mt-1.5 text-2xl text-ink-50 sm:text-[1.75rem]">{data.committee.name}</h2>
					{#if data.committee.topic}
						<p class="mt-2 text-sm leading-relaxed text-ink-300">{data.committee.topic}</p>
					{/if}
					<p class="mt-3 text-xs text-ink-400">Seated as <span class="text-brass-300">{role}</span></p>
				</div>
				<span class="emblem hidden h-12 w-12 shrink-0 rounded-xl text-lg sm:flex">M</span>
			</div>

			<!-- Status chips -->
			<div class="mt-6 flex flex-wrap items-center gap-2">
				<a
					href="/committee/{data.committee.slug}/documents"
					class="focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors {data.hasPositionPaper
						? 'border-signal-green/30 bg-signal-green/10 text-signal-green hover:bg-signal-green/15'
						: 'border-signal-amber/30 bg-signal-amber/10 text-signal-amber hover:bg-signal-amber/15'}"
				>
					<span class="h-1.5 w-1.5 rounded-full {data.hasPositionPaper ? 'bg-signal-green' : 'bg-signal-amber'}"></span>
					Position paper · {data.hasPositionPaper ? 'Submitted' : 'Not submitted yet'}
				</a>

				{#if data.unreadNotes > 0}
					<a
						href="/committee/{data.committee.slug}"
						class="focus-ring inline-flex items-center gap-2 rounded-full border border-brass-600/40 bg-brass-glow px-3 py-1.5 text-xs font-medium text-brass-300 transition-colors hover:bg-brass-500/20"
					>
						<span class="h-1.5 w-1.5 rounded-full bg-brass-400"></span>
						{data.unreadNotes} unread {data.unreadNotes === 1 ? 'note' : 'notes'}
					</a>
				{/if}
			</div>

			<!-- Primary actions -->
			<div class="mt-7 flex flex-wrap gap-3">
				<a href="/committee/{data.committee.slug}" class="btn btn-brass focus-ring">Enter committee room</a>
				<a href="/committee/{data.committee.slug}/documents" class="btn btn-ghost focus-ring">Documents</a>
			</div>
		</section>
	{:else}
		<!-- Not seated: empty state -->
		<section class="card mt-10 px-7 py-12 text-center sm:px-8">
			<div class="emblem mx-auto h-12 w-12 rounded-full text-lg opacity-70">M</div>
			<p class="label label-brass mt-5">Awaiting assignment</p>
			<h2 class="display mt-2 text-2xl text-ink-50">You haven't been seated yet</h2>
			<p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-400">
				Your delegation hasn't been assigned to a committee. See the secretariat desk to be seated.
			</p>
		</section>
	{/if}
</div>
