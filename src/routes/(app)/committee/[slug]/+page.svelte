<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount, tick } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Local chat messages may include an optimistic entry awaiting server confirmation.
	// createdAt is a Date from the initial load but a string from the JSON poll, so allow both.
	type ChatMessage = Omit<PageData['messages'][number], 'createdAt'> & {
		createdAt: string | Date;
		pending?: boolean;
	};

	let messages = $state<ChatMessage[]>(data.messages);
	let queue = $state(data.queue);
	let speaking = $state(data.speaking);
	let committeeStatus = $state(data.committee.status);
	let messageInput = $state('');
	let sending = $state(false);
	let scrollEl: HTMLDivElement;

	let lastEventAt = $state(
		data.messages.length > 0
			? new Date(data.messages[data.messages.length - 1].createdAt).toISOString()
			: new Date(0).toISOString()
	);

	const isChair = data.delegate?.role === 'chair' || data.delegate?.role === 'admin';
	const inQueue = $derived(queue.some((q) => q.delegateId === data.delegate?.id));

	const roleLabel: Record<string, string> = { chair: 'Chair', admin: 'Secretariat' };

	// What to show beside a name: a delegate's country, or a non-delegate's role.
	function affiliation(country: string, role?: string): string {
		return country || (role ? (roleLabel[role] ?? '') : '');
	}

	const statusLabel: Record<string, string> = {
		pending: 'Not yet in session',
		in_session: 'In session',
		suspended: 'Suspended',
		closed: 'Closed'
	};
	const statusDot: Record<string, string> = {
		pending: 'bg-ink-400',
		in_session: 'bg-signal-green pulse-dot',
		suspended: 'bg-signal-amber',
		closed: 'bg-signal-red'
	};

	async function scrollToBottom() {
		await tick();
		scrollEl?.scrollTo({ top: scrollEl.scrollHeight, behavior: 'smooth' });
	}

	async function poll() {
		const res = await fetch(`/committee/${data.committee.slug}/events?since=${encodeURIComponent(lastEventAt)}`);
		if (!res.ok) return;
		const update = await res.json();

		if (update.messages.length > 0) {
			const incoming: ChatMessage[] = update.messages;
			// Drop optimistic entries the server has now confirmed (match author + body).
			const confirmed = messages.filter(
				(m) => !m.pending || !incoming.some((i) => i.author === m.author && i.body === m.body)
			);
			messages = [...confirmed, ...incoming];
			lastEventAt = new Date(incoming[incoming.length - 1].createdAt).toISOString();
			scrollToBottom();
		}
		queue = update.queue;
		speaking = update.speaking;
		committeeStatus = update.status;
	}

	onMount(() => {
		scrollToBottom();
		const interval = setInterval(() => poll().catch(() => {}), 1000);
		return () => clearInterval(interval);
	});
</script>

<svelte:head>
	<title>{data.committee.name} — MIMUN 2026</title>
</svelte:head>

<div class="grid h-[calc(100vh-57px)] grid-cols-1 lg:grid-cols-[1fr_380px]">
	<!-- Chamber floor: debate + chat -->
	<section class="flex min-w-0 flex-col border-r border-white/[0.07]">
		<div class="flex items-center justify-between gap-4 border-b border-white/[0.07] px-6 py-4">
			<div class="min-w-0">
				<p class="label label-brass mb-1">In committee</p>
				<h1 class="display truncate text-xl text-ink-50">{data.committee.name}</h1>
				{#if data.committee.topic}<p class="mt-1 truncate text-sm text-ink-400">{data.committee.topic}</p>{/if}
			</div>
			<div class="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-ink-200">
				<span class="h-1.5 w-1.5 rounded-full {statusDot[committeeStatus]}"></span>
				{statusLabel[committeeStatus]}
			</div>
		</div>

		<div bind:this={scrollEl} class="flex-1 space-y-5 overflow-y-auto px-6 py-6">
			{#each messages as message (message.id)}
				<div class="flex gap-3" class:opacity-50={message.pending}>
					<div class="emblem mt-0.5 h-8 w-8 shrink-0 rounded-full text-xs">
						{message.author.slice(0, 1)}
					</div>
					<div class="min-w-0">
						<div class="flex items-baseline gap-2">
							<span class="text-sm font-semibold text-ink-100">{message.author}</span>
							{#if affiliation(message.country, message.role)}
								<span class="label text-[0.625rem] text-ink-500">{affiliation(message.country, message.role)}</span>
							{/if}
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
				const me = data.delegate!;
				const body = messageInput.trim();
				const tempId = `temp-${crypto.randomUUID()}`;
				sending = true;

				// Optimistically show our own message immediately; the next poll
				// reconciles it with the server-confirmed copy (matched by author + body).
				messages = [
					...messages,
					{ id: tempId, body, createdAt: new Date().toISOString(), author: me.fullName, country: me.country, role: me.role, pending: true }
				];
				messageInput = '';
				scrollToBottom();

				return async ({ result, update }) => {
					if (result.type === 'failure' || result.type === 'error') {
						messages = messages.filter((m) => m.id !== tempId);
						messageInput = body; // restore so the delegate can retry
					}
					await update({ reset: false });
					sending = false;
				};
			}}
		>
			<div class="flex items-center gap-3">
				<input
					name="body"
					bind:value={messageInput}
					placeholder="Address your committee…"
					autocomplete="off"
					class="input flex-1"
				/>
				<button type="submit" disabled={sending || !messageInput.trim()} class="btn btn-brass focus-ring">
					Send
				</button>
			</div>
		</form>
	</section>

	<!-- The dais: speaker's list + chair controls -->
	<aside class="flex flex-col bg-ink-950/30">
		<div class="border-b border-white/[0.07] px-5 py-4">
			<p class="label label-brass">Speaking now</p>
			{#if speaking}
				<div class="mt-3 flex items-center gap-3 rounded-xl border border-brass-600/30 bg-brass-500/[0.08] px-4 py-3">
					<span class="h-2 w-2 shrink-0 rounded-full bg-signal-green pulse-dot"></span>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold text-ink-50">{speaking.name}</p>
						{#if speaking.country}<p class="label text-[0.625rem] text-ink-400">{speaking.country}</p>{/if}
					</div>
				</div>
			{:else}
				<p class="mt-3 text-sm text-ink-500">No one holds the floor.</p>
			{/if}
		</div>

		<div class="flex-1 overflow-y-auto px-5 py-4">
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
					<p class="rounded-lg border border-dashed border-white/[0.07] px-3 py-4 text-center text-sm text-ink-500">
						The list is open.
					</p>
				{/each}
			</ol>

			{#if !isChair}
				<form method="POST" action={inQueue ? '?/leaveQueue' : '?/joinQueue'} use:enhance class="mt-4">
					<button type="submit" class="btn focus-ring w-full {inQueue ? 'btn-ghost' : 'btn-brass'}">
						{inQueue ? 'Withdraw from the list' : 'Request to speak'}
					</button>
				</form>
			{/if}
		</div>

		{#if isChair}
			<div class="border-t border-white/[0.07] px-5 py-4">
				<p class="label label-brass mb-3">Chair controls</p>
				<form method="POST" action="?/callNext" use:enhance>
					<button type="submit" disabled={queue.length === 0} class="btn btn-brass focus-ring w-full">
						Recognize next speaker
					</button>
				</form>

				<p class="label mt-4 mb-2 text-[0.625rem]">Session</p>
				<div class="grid grid-cols-3 gap-2">
					{#each [['in_session', 'Open'], ['suspended', 'Suspend'], ['closed', 'Close']] as [value, text] (value)}
						<form method="POST" action="?/setStatus" use:enhance>
							<input type="hidden" name="status" {value} />
							<button
								type="submit"
								class="btn focus-ring w-full py-2 text-xs {committeeStatus === value ? 'btn-ghost border-brass-600/50 text-brass-300' : 'btn-quiet'}"
							>
								{text}
							</button>
						</form>
					{/each}
				</div>
			</div>
		{/if}
	</aside>
</div>
