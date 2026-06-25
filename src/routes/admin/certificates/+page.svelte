<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const AWARDS = [
		'Certificate of Participation',
		'Best Delegate',
		'Outstanding Delegate',
		'Honourable Mention',
		'Verbal Commendation'
	];

	// On-screen committee filter. "" = all committees.
	let filter = $state('');
	// The award title stamped onto every certificate in the current run.
	let award = $state(AWARDS[0]);

	const visible = $derived(
		filter ? data.certificates.filter((c) => c.committeeName === filter) : data.certificates
	);

	function print() {
		window.print();
	}
</script>

<svelte:head><title>Certificates — MIMUN 2026</title></svelte:head>

<div class="surface-chamber min-h-[calc(100vh-57px)] px-6 py-8 lg:px-10">
	<!-- Controls: hidden when printing -->
	<div class="no-print mb-8 flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="label label-brass mb-2">Secretariat · Recognition</p>
			<h1 class="display text-3xl text-ink-50">Certificates</h1>
			<p class="mt-2 max-w-xl text-sm text-ink-400">
				One diploma per active delegate. Choose an award, then print — each certificate prints to
				its own landscape page, ready to sign and present at the closing ceremony.
			</p>
		</div>

		<div class="flex flex-wrap items-end gap-3">
			<label class="flex flex-col gap-1.5">
				<span class="label">Award</span>
				<select bind:value={award} class="input focus-ring min-w-[15rem] py-2 text-sm">
					{#each AWARDS as title (title)}
						<option value={title}>{title}</option>
					{/each}
				</select>
			</label>

			{#if data.committeeNames.length > 1}
				<label class="flex flex-col gap-1.5">
					<span class="label">Committee</span>
					<select bind:value={filter} class="input focus-ring min-w-[12rem] py-2 text-sm">
						<option value="">All committees ({data.certificates.length})</option>
						{#each data.committeeNames as name (name)}
							<option value={name}>{name}</option>
						{/each}
					</select>
				</label>
			{/if}

			<button onclick={print} class="btn btn-brass focus-ring">Print</button>
		</div>
	</div>

	{#if visible.length === 0}
		<div class="no-print py-20 text-center">
			<p class="display text-2xl text-ink-100">No active delegates</p>
			<p class="mt-2 text-sm text-ink-400">
				Add delegates from the roster, then return here to issue their certificates.
			</p>
		</div>
	{:else}
		<!-- One certificate per delegate. Brass-on-chamber on screen; flips to a
		     diploma on ink-on-white in print, exactly one per landscape page. -->
		<div class="cert-stack">
			{#each visible as c, i (c.fullName + '·' + c.committeeName + '·' + i)}
				<article class="cert">
					<div class="cert__frame">
						<header class="cert__head">
							<span class="cert__conf label label-brass">{c.conferenceName}</span>
							<span class="cert__rule"></span>
						</header>

						<div class="cert__crest">
							<span class="emblem cert__emblem">M</span>
						</div>

						<p class="cert__eyebrow label">This certifies that</p>

						<h2 class="cert__name display">{c.fullName}</h2>

						{#if c.country}
							<p class="cert__country">representing {c.country}</p>
						{/if}

						<p class="cert__committee">
							in the committee of <span class="cert__committee-name">{c.committeeName}</span>
						</p>

						<div class="cert__award">
							<span class="cert__award-flank"></span>
							<h3 class="cert__award-title display">{award}</h3>
							<span class="cert__award-flank"></span>
						</div>

						<footer class="cert__sign">
							<div class="cert__sign-block">
								<span class="signature cert__sign-name">The Secretariat</span>
								<span class="cert__sign-line"></span>
								<span class="label cert__sign-role">Secretariat · MIMUN 2026</span>
							</div>
							<div class="cert__sign-block">
								<span class="cert__seal emblem">★</span>
								<span class="cert__sign-line"></span>
								<span class="label cert__sign-role">Seal of the Conference</span>
							</div>
						</footer>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* ---- On-screen (Chamber dark) ---------------------------------- */
	.cert-stack {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	/* The certificate card: a landscape-ish diploma. */
	.cert {
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.012));
		border: 1px solid rgba(255, 255, 255, 0.07);
		border-radius: 0.875rem;
		padding: 1.25rem;
	}

	/* Double border: outer card + inner brass-ruled frame. */
	.cert__frame {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.85rem;
		min-height: 22rem;
		padding: 2.25rem 2.5rem 2rem;
		border: 1.5px solid rgba(205, 168, 92, 0.4);
		border-radius: 0.5rem;
		box-shadow: inset 0 0 0 1px rgba(205, 168, 92, 0.12);
		text-align: center;
	}

	.cert__head {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
	}

	.cert__conf {
		font-size: 0.7rem;
		letter-spacing: 0.2em;
	}

	.cert__rule {
		width: 4rem;
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--color-brass-500), transparent);
		opacity: 0.6;
	}

	.cert__crest {
		margin-top: 0.25rem;
	}

	.cert__emblem {
		height: 3rem;
		width: 3rem;
		border-radius: 9999px;
		font-size: 1.1rem;
	}

	.cert__eyebrow {
		color: var(--color-ink-400);
		font-size: 0.625rem;
		letter-spacing: 0.22em;
	}

	.cert__name {
		font-size: 2.75rem;
		line-height: 1.04;
		color: var(--color-ink-50);
	}

	.cert__country {
		font-size: 0.9rem;
		font-style: italic;
		color: var(--color-ink-300);
	}

	.cert__committee {
		font-size: 0.95rem;
		color: var(--color-ink-300);
	}

	.cert__committee-name {
		color: var(--color-brass-300);
		font-weight: 600;
	}

	.cert__award {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		width: 100%;
		max-width: 30rem;
		margin-top: 0.5rem;
	}

	.cert__award-flank {
		flex: 1;
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--color-brass-600), transparent);
		opacity: 0.55;
	}

	.cert__award-title {
		flex-shrink: 0;
		font-size: 1.45rem;
		font-style: italic;
		letter-spacing: 0.01em;
		color: var(--color-brass-300);
		white-space: nowrap;
	}

	.cert__sign {
		display: flex;
		justify-content: center;
		gap: 4rem;
		width: 100%;
		margin-top: auto;
		padding-top: 1.25rem;
	}

	.cert__sign-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 11rem;
	}

	.cert__sign-name {
		font-size: 2rem;
		color: var(--color-ink-100);
		line-height: 0.9;
		padding-bottom: 0.15rem;
	}

	.cert__seal {
		height: 2.1rem;
		width: 2.1rem;
		border-radius: 9999px;
		font-size: 0.85rem;
		margin-bottom: 0.35rem;
	}

	.cert__sign-line {
		width: 100%;
		height: 1px;
		margin-top: 0.35rem;
		background: rgba(255, 255, 255, 0.25);
	}

	.cert__sign-role {
		margin-top: 0.45rem;
		font-size: 0.55rem;
		letter-spacing: 0.16em;
		color: var(--color-ink-500);
	}

	/* ---- Print (white diploma, black ink, one per landscape page) -- */
	@media print {
		/* Strip the app chrome: admin header + on-screen controls. */
		:global(header) {
			display: none !important;
		}
		.no-print {
			display: none !important;
		}

		/* Exactly one certificate per landscape sheet. */
		@page {
			size: landscape;
			margin: 1cm;
		}

		/* Force a white page regardless of the dark color-scheme. */
		:global(html),
		:global(body) {
			background: #fff !important;
		}
		:global(.surface-chamber) {
			background: #fff !important;
		}
		.surface-chamber {
			min-height: 0 !important;
			padding: 0 !important;
		}

		.cert-stack {
			display: block;
			gap: 0;
		}

		/* Each diploma fills its own page and never splits. */
		.cert {
			background: #fff !important;
			border: none !important;
			border-radius: 0 !important;
			box-shadow: none !important;
			padding: 0 !important;
			break-after: page;
			page-break-after: always;
			break-inside: avoid;
			page-break-inside: avoid;
		}
		.cert:last-child {
			break-after: auto;
			page-break-after: auto;
		}

		/* Decorative double border that survives B/W printing. */
		.cert__frame {
			color: #000 !important;
			min-height: 16cm;
			height: 16cm;
			padding: 1.6cm 2cm;
			border: 3px double #000 !important;
			border-radius: 0 !important;
			box-shadow: inset 0 0 0 1.5px #000 !important;
			justify-content: center;
			gap: 0.55cm;
		}

		.cert__conf {
			color: #000 !important;
		}
		.cert__rule {
			background: #000 !important;
			opacity: 1 !important;
			height: 2px;
		}
		:global(.cert .emblem) {
			color: #000 !important;
			background: #fff !important;
			border: 1.5px solid #000 !important;
			box-shadow: none !important;
		}
		.cert__eyebrow {
			color: #444 !important;
		}
		.cert__name {
			color: #000 !important;
		}
		.cert__country {
			color: #222 !important;
		}
		.cert__committee {
			color: #222 !important;
		}
		.cert__committee-name {
			color: #000 !important;
		}
		.cert__award-flank {
			background: #000 !important;
			opacity: 1 !important;
		}
		.cert__award-title {
			color: #000 !important;
		}
		.cert__sign-name {
			color: #000 !important;
		}
		.cert__sign-line {
			background: #000 !important;
			height: 1.5px;
		}
		.cert__sign-role {
			color: #333 !important;
		}
	}
</style>
