<script lang="ts">
	import type { Feedback } from '$lib/feedback';
	import { SCORE_LABELS } from '$lib/feedback';

	let { feedback, provider = '' }: { feedback: Feedback; provider?: string } = $props();

	// 1–5 → colour. Low scores read amber/red, strong scores read green.
	function tone(score: number): string {
		if (score >= 4) return 'var(--color-signal-green)';
		if (score >= 3) return 'var(--color-paper-brass)';
		return 'var(--color-signal-amber)';
	}
	const clamp = (n: number) => Math.max(0, Math.min(5, Math.round(n || 0)));
</script>

<div class="fb-card rounded-xl border border-paper-line bg-paper-100/60 p-4">
	<div class="flex items-center justify-between">
		<p class="label text-paper-ink-500">Parliamentarian's review</p>
		{#if provider}<span class="label text-[0.55rem] text-paper-ink-500">AI · {provider}</span>{/if}
	</div>

	<p class="mt-2 text-sm leading-relaxed text-paper-ink-900">{feedback.overall}</p>

	<!-- Scores -->
	<div class="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
		{#each SCORE_LABELS as s, si (s.key)}
			{@const v = clamp(feedback.scores?.[s.key])}
			<div>
				<div class="flex items-baseline justify-between">
					<span class="text-[0.7rem] text-paper-ink-700">{s.label}</span>
					<span class="font-mono text-[0.7rem] text-paper-ink-500">{v}/5</span>
				</div>
				<div class="mt-1 flex gap-0.5">
					{#each Array(5) as _, i (i)}
						<span
							class="h-1.5 flex-1 rounded-full {i < v ? 'pip' : ''}"
							style="background-color: {i < v ? tone(v) : 'var(--color-paper-200)'}; animation-delay: {si * 90 + i * 45}ms"
						></span>
					{/each}
				</div>
			</div>
		{/each}
	</div>

	{#if feedback.strengths?.length}
		<div class="mt-4">
			<p class="label mb-1.5 text-paper-ink-500">Strengths</p>
			<ul class="space-y-1">
				{#each feedback.strengths as s (s)}
					<li class="flex gap-2 text-sm text-paper-ink-900">
						<span class="mt-0.5 text-[color:var(--color-signal-green)]">✓</span>
						<span>{s}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if feedback.improvements?.length}
		<div class="mt-4">
			<p class="label mb-1.5 text-paper-ink-500">To strengthen</p>
			<ul class="space-y-2">
				{#each feedback.improvements as imp (imp.area + imp.note)}
					<li class="text-sm text-paper-ink-900">
						<span class="font-medium text-paper-ink-700">{imp.area}.</span>
						{imp.note}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	/* The review card eases in, then its score pips fill left-to-right in a stagger
	   (animation-delay set inline per pip) — a scorecard being marked up. */
	.fb-card {
		animation: fb-rise 0.4s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.pip {
		transform-origin: left center;
		animation: pip-fill 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	@keyframes fb-rise {
		from {
			transform: translateY(8px);
			opacity: 0;
		}
	}
	@keyframes pip-fill {
		from {
			transform: scaleX(0);
			opacity: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fb-card,
		.pip {
			animation: none;
		}
	}
</style>
