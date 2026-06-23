<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in — MIMUN 2026</title>
</svelte:head>

<div class="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
	<div
		class="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-[var(--color-accent-500)] opacity-[0.12] blur-[140px]"
	></div>

	<div class="relative w-full max-w-sm">
		<div class="mb-10 flex flex-col items-center gap-3 text-center">
			<div
				class="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-semibold tracking-tight"
			>
				M
			</div>
			<div>
				<h1 class="text-[1.35rem] font-semibold tracking-tight text-[var(--color-ink-50)]">MIMUN 2026</h1>
				<p class="mt-1 text-sm text-[var(--color-ink-400)]">Delegate &amp; chair access</p>
			</div>
		</div>

		<form
			method="POST"
			class="glass-panel rounded-2xl p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)]"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<label for="inviteCode" class="mb-2 block text-xs font-medium tracking-wide text-[var(--color-ink-300)] uppercase">
				Invite code
			</label>
			<input
				id="inviteCode"
				name="inviteCode"
				type="text"
				autocomplete="off"
				autocapitalize="characters"
				spellcheck="false"
				placeholder="e.g. FR-7K2P"
				class="focus-ring w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-center font-mono text-lg tracking-[0.18em] text-[var(--color-ink-50)] placeholder:text-[var(--color-ink-500)]"
			/>

			{#if form?.message}
				<p class="mt-3 text-center text-sm text-[var(--color-signal-red)]">{form.message}</p>
			{/if}

			<button
				type="submit"
				disabled={submitting}
				class="focus-ring mt-6 w-full rounded-lg bg-[var(--color-accent-500)] py-3 text-sm font-medium text-white transition-all hover:bg-[var(--color-accent-400)] disabled:opacity-50"
			>
				{submitting ? 'Verifying…' : 'Enter committee'}
			</button>
		</form>

		<p class="mt-6 text-center text-xs text-[var(--color-ink-500)]">
			Lost your code? Find your committee chair or the secretariat desk.
		</p>
	</div>
</div>
