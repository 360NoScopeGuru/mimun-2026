<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in — MIMUN 2026</title>
</svelte:head>

<div class="surface-chamber relative flex min-h-screen items-center justify-center overflow-hidden px-6">
	<!-- brass horizon glow -->
	<div
		class="pointer-events-none absolute -top-48 left-1/2 h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-brass-500 opacity-[0.08] blur-[150px]"
	></div>

	<div class="relative w-full max-w-sm">
		<div class="mb-9 flex flex-col items-center gap-4 text-center">
			<div class="emblem h-14 w-14 rounded-full text-xl">M</div>
			<div>
				<p class="label label-brass mb-2">Model United Nations · MMXXVI</p>
				<h1 class="display text-3xl text-ink-50">MIMUN 2026</h1>
				<p class="mt-2 text-sm text-ink-400">Delegate &amp; chair access</p>
			</div>
		</div>

		<form
			method="POST"
			class="card p-7 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_40px_90px_-50px_rgba(0,0,0,0.9)]"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<label for="inviteCode" class="label mb-2.5 block">Invite code</label>
			<input
				id="inviteCode"
				name="inviteCode"
				type="text"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				placeholder="CH-WRMM"
				class="input text-center font-mono text-lg tracking-[0.22em] uppercase"
			/>

			{#if form?.message}
				<p class="mt-3 text-center text-sm text-signal-red">{form.message}</p>
			{/if}

			<button type="submit" disabled={submitting} class="btn btn-brass focus-ring mt-6 w-full">
				{submitting ? 'Verifying…' : 'Enter the chamber'}
			</button>
		</form>

		<div class="mt-7 flex items-center gap-3">
			<hr class="rule rule-brass flex-1" />
			<span class="label text-ink-500">Secretariat issued</span>
			<hr class="rule rule-brass flex-1" />
		</div>

		<p class="mt-4 text-center text-xs text-ink-500">
			Lost your code? Find your committee chair or the secretariat desk.
		</p>
	</div>
</div>
