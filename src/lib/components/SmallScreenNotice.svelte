<script lang="ts">
	// Gate for views that genuinely need room (drafting, admin). Render this
	// alongside the real content wrapped in `hidden sm:block`; this notice is
	// `sm:hidden`, so phones see the prompt and larger screens see the view.
	let { feature = 'This view' }: { feature?: string } = $props();
</script>

<div class="surface-chamber flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center sm:hidden">
	<div class="emblem mb-5 h-12 w-12 rounded-full text-lg">M</div>
	<p class="label label-brass">Best on a larger screen</p>
	<p class="display mt-2 text-2xl text-ink-50">Switch to a tablet or laptop</p>
	<p class="mt-3 max-w-xs text-sm leading-relaxed text-ink-400">
		{feature} needs more room than a phone gives. Open it on a tablet or computer for the full experience.
	</p>
</div>
