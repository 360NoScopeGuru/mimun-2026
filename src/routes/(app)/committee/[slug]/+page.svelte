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
		pending: 'bg-[var(--color-ink-400)]',
		in_session: 'bg-[var(--color-signal-green)] pulse-dot',
		suspended: 'bg-[var(--color-signal-amber)]',
		closed: 'bg-[var(--color-signal-red)]'
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

<div class="grid h-[calc(100vh-57px)] grid-cols-1 lg:grid-cols-[1fr_360px]">
	<!-- Chat column -->
	<section class="flex flex-col border-r border-white/[0.06]">
		<div class="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
			<div>
				<h1 class="text-base font-semibold tracking-tight text-[var(--color-ink-50)]">{data.committee.name}</h1>
				<p class="mt-0.5 text-xs text-[var(--color-ink-400)]">{data.committee.topic}</p>
			</div>
			<div class="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-[var(--color-ink-300)]">
				<span class="h-1.5 w-1.5 rounded-full {statusDot[committeeStatus]}"></span>
				{statusLabel[committeeStatus]}
			</div>
		</div>

		<div bind:this={scrollEl} class="flex-1 space-y-4 overflow-y-auto px-6 py-5">
			{#each messages as message (message.id)}
				<div class="flex gap-3" class:opacity-60={message.pending}>
					<div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10px] font-semibold text-[var(--color-ink-200)]">
						{message.author.slice(0, 1)}
					</div>
					<div>
						<div class="flex items-baseline gap-2">
							<span class="text-sm font-medium text-[var(--color-ink-100)]">{message.author}</span>
							{#if affiliation(message.country, message.role)}<span class="text-xs text-[var(--color-ink-500)]">{affiliation(message.country, message.role)}</span>{/if}
						</div>
						<p class="mt-0.5 text-sm leading-relaxed text-[var(--color-ink-200)]">{message.body}</p>
					</div>
				</div>
			{:else}
				<p class="mt-10 text-center text-sm text-[var(--color-ink-500)]">No messages yet — say hello to your committee.</p>
			{/each}
		</div>

		<form
			method="POST"
			action="?/sendMessage"
			class="border-t border-white/[0.06] px-6 py-4"
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
					placeholder="Message your committee…"
					autocomplete="off"
					class="focus-ring flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--color-ink-50)] placeholder:text-[var(--color-ink-500)]"
				/>
				<button
					type="submit"
					disabled={sending || !messageInput.trim()}
					class="focus-ring rounded-xl bg-[var(--color-accent-500)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-400)] disabled:opacity-40"
				>
					Send
				</button>
			</div>
		</form>
	</section>

	<!-- Speaker list / chair controls column -->
	<aside class="flex flex-col">
		<div class="border-b border-white/[0.06] px-5 py-4">
			<h2 class="text-xs font-semibold tracking-wide text-[var(--color-ink-300)] uppercase">Speaking now</h2>
			{#if speaking}
				<div class="mt-3 flex items-center gap-3 rounded-xl border border-[var(--color-accent-500)]/30 bg-[var(--color-accent-500)]/10 px-4 py-3">
					<span class="h-2 w-2 rounded-full bg-[var(--color-signal-green)] pulse-dot"></span>
					<div>
						<p class="text-sm font-medium text-[var(--color-ink-50)]">{speaking.name}</p>
						<p class="text-xs text-[var(--color-ink-400)]">{speaking.country}</p>
					</div>
				</div>
			{:else}
				<p class="mt-3 text-sm text-[var(--color-ink-500)]">No one is currently speaking.</p>
			{/if}
		</div>

		<div class="flex-1 overflow-y-auto px-5 py-4">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-xs font-semibold tracking-wide text-[var(--color-ink-300)] uppercase">Speaker's list</h2>
				<span class="text-xs text-[var(--color-ink-500)]">{queue.length} waiting</span>
			</div>

			<ol class="space-y-2">
				{#each queue as entry, i (entry.id)}
					<li class="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
						<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-medium text-[var(--color-ink-300)]">
							{i + 1}
						</span>
						<div class="flex-1">
							<p class="text-sm text-[var(--color-ink-100)]">{entry.name}</p>
							<p class="text-xs text-[var(--color-ink-500)]">{entry.country}</p>
						</div>
					</li>
				{:else}
					<p class="text-sm text-[var(--color-ink-500)]">The queue is empty.</p>
				{/each}
			</ol>

			{#if !isChair}
				<form method="POST" action={inQueue ? '?/leaveQueue' : '?/joinQueue'} use:enhance class="mt-4">
					<button
						type="submit"
						class="focus-ring w-full rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors {inQueue
							? 'border-white/10 text-[var(--color-ink-300)] hover:bg-white/5'
							: 'border-transparent bg-[var(--color-accent-500)] text-white hover:bg-[var(--color-accent-400)]'}"
					>
						{inQueue ? 'Leave the queue' : 'Request to speak'}
					</button>
				</form>
			{/if}
		</div>

		{#if isChair}
			<div class="border-t border-white/[0.06] px-5 py-4">
				<h2 class="mb-3 text-xs font-semibold tracking-wide text-[var(--color-ink-300)] uppercase">Chair controls</h2>
				<form method="POST" action="?/callNext" use:enhance>
					<button
						type="submit"
						disabled={queue.length === 0}
						class="focus-ring w-full rounded-xl bg-[var(--color-accent-500)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-400)] disabled:opacity-40"
					>
						Call next speaker
					</button>
				</form>

				<div class="mt-3 grid grid-cols-3 gap-2">
					<form method="POST" action="?/setStatus" use:enhance>
						<input type="hidden" name="status" value="in_session" />
						<button type="submit" class="focus-ring w-full rounded-lg border border-white/10 py-2 text-xs text-[var(--color-ink-300)] hover:bg-white/5">
							Open
						</button>
					</form>
					<form method="POST" action="?/setStatus" use:enhance>
						<input type="hidden" name="status" value="suspended" />
						<button type="submit" class="focus-ring w-full rounded-lg border border-white/10 py-2 text-xs text-[var(--color-ink-300)] hover:bg-white/5">
							Suspend
						</button>
					</form>
					<form method="POST" action="?/setStatus" use:enhance>
						<input type="hidden" name="status" value="closed" />
						<button type="submit" class="focus-ring w-full rounded-lg border border-white/10 py-2 text-xs text-[var(--color-ink-300)] hover:bg-white/5">
							Close
						</button>
					</form>
				</div>
			</div>
		{/if}
	</aside>
</div>
