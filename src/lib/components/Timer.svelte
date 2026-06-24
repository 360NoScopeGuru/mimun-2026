<script lang="ts">
	// Counts down to an absolute `endsAt` timestamp (server-authoritative).
	// Date from the initial SSR load, string from the JSON poll.
	let { endsAt, label = '' }: { endsAt: string | Date | null; label?: string } = $props();

	let now = $state(Date.now());

	$effect(() => {
		const i = setInterval(() => (now = Date.now()), 250);
		return () => clearInterval(i);
	});

	const remaining = $derived(endsAt ? Math.max(0, Math.round((new Date(endsAt).getTime() - now) / 1000)) : null);
	const mm = $derived(remaining === null ? '--' : String(Math.floor(remaining / 60)).padStart(2, '0'));
	const ss = $derived(remaining === null ? '--' : String(remaining % 60).padStart(2, '0'));
	const expired = $derived(remaining === 0);
</script>

<div class="flex items-baseline gap-2">
	{#if label}<span class="label text-[0.6rem] text-ink-500">{label}</span>{/if}
	<span
		class="font-mono text-sm font-medium tabular-nums {expired ? 'text-signal-red' : 'text-ink-100'}"
		class:pulse-dot={remaining !== null && remaining <= 10 && !expired}
	>
		{mm}:{ss}
	</span>
</div>
