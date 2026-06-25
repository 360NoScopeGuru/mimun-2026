<script lang="ts">
	import { page } from '$app/stores';

	// Friendly, in-character fallbacks when the thrown error has no message.
	const messages: Record<number, string> = {
		403: 'You don’t have access to this chamber.',
		404: 'This page isn’t on the order of business.',
		429: 'Too many requests in a row — give it a moment.',
		500: 'Something went wrong on our side. The secretariat has been notified.',
		503: 'This service is briefly unavailable. Please try again shortly.'
	};
</script>

<svelte:head><title>{$page.status} — MIMUN 2026</title></svelte:head>

<div class="surface-chamber flex min-h-screen flex-col items-center justify-center px-6 text-center">
	<div class="emblem mb-7 h-14 w-14 rounded-full text-xl">M</div>
	<p class="label label-brass">Point of order</p>
	<p class="display mt-3 text-7xl text-ink-50">{$page.status}</p>
	<p class="mt-4 max-w-sm text-sm leading-relaxed text-ink-300">
		{$page.error?.message || messages[$page.status] || 'An unexpected error occurred.'}
	</p>
	<div class="mt-8 flex flex-wrap items-center justify-center gap-3">
		<a href="/" class="btn btn-brass focus-ring">Return to the chamber</a>
		<a href="/login" class="btn btn-ghost focus-ring">Sign in</a>
	</div>
</div>
