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

	// On-screen committee filter. "" = all committees.
	let filter = $state('');
	const visible = $derived(
		filter ? data.cards.filter((c) => c.committeeName === filter) : data.cards
	);

	function print() {
		window.print();
	}
</script>

<svelte:head><title>Invite cards — MIMUN 2026</title></svelte:head>

<div class="surface-chamber min-h-[calc(100vh-57px)] px-6 py-8 lg:px-10">
	<!-- Controls: hidden when printing -->
	<div class="no-print mb-8 flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="label label-brass mb-2">Secretariat · Distribution</p>
			<h1 class="display text-3xl text-ink-50">Invite cards</h1>
			<p class="mt-2 max-w-xl text-sm text-ink-400">
				One card per active delegate. Print these, cut along the borders, and hand each delegate
				their code at the registration desk. Codes are case-insensitive at sign-in.
			</p>
		</div>

		<div class="flex items-end gap-3">
			{#if data.committeeNames.length > 1}
				<label class="flex flex-col gap-1.5">
					<span class="label">Committee</span>
					<select bind:value={filter} class="input focus-ring min-w-[12rem] py-2 text-sm">
						<option value="">All committees ({data.cards.length})</option>
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
				Add delegates from the roster, then return here to print their codes.
			</p>
		</div>
	{:else}
		<!-- Card grid: brass-on-chamber on screen, flips to ink-on-white in print -->
		<div class="card-grid">
			{#each visible as c (c.inviteCode)}
				<article class="invite-card card">
					<div class="invite-card__head">
						<span class="emblem h-7 w-7 rounded-md text-xs">M</span>
						<div class="min-w-0">
							<p class="invite-card__conf">{c.conferenceName}</p>
							<p class="invite-card__committee">{c.committeeName}</p>
						</div>
					</div>

					<div class="invite-card__body">
						<p class="invite-card__name display">{c.fullName}</p>
						<p class="invite-card__meta">{c.country || roleLabel[c.role] || c.role}</p>
					</div>

					<div class="invite-card__code">
						<span class="invite-card__code-label">Invite code</span>
						<span class="invite-card__code-value font-mono">{c.inviteCode}</span>
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* ---- On-screen (Chamber dark) ---------------------------------- */
	.card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 1rem;
	}

	.invite-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.1rem 1.2rem 1.25rem;
	}

	.invite-card__head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.invite-card__conf {
		font-family: var(--font-accent);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-brass-400);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.invite-card__committee {
		font-size: 0.78rem;
		color: var(--color-ink-300);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.invite-card__body {
		border-top: 1px solid rgba(255, 255, 255, 0.07);
		padding-top: 0.7rem;
	}

	.invite-card__name {
		font-size: 1.35rem;
		line-height: 1.1;
		color: var(--color-ink-50);
	}

	.invite-card__meta {
		margin-top: 0.2rem;
		font-size: 0.8rem;
		color: var(--color-ink-400);
	}

	.invite-card__code {
		margin-top: auto;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border-top: 1px solid rgba(255, 255, 255, 0.07);
		padding-top: 0.7rem;
	}

	.invite-card__code-label {
		font-family: var(--font-accent);
		font-size: 0.55rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--color-ink-500);
	}

	.invite-card__code-value {
		font-size: 1.6rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		color: var(--color-brass-300);
	}

	/* ---- Print (white cards, black ink, legible in B/W) ------------ */
	@media print {
		/* Strip the app chrome: admin header + on-screen controls. */
		:global(header) {
			display: none !important;
		}
		.no-print {
			display: none !important;
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

		/* Two columns, each card kept whole across page breaks. */
		.card-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 0.4cm;
			margin: 0.6cm;
		}

		.invite-card {
			background: #fff !important;
			color: #000 !important;
			border: 1.5px solid #000 !important;
			border-radius: 6px !important;
			box-shadow: none !important;
			break-inside: avoid;
			page-break-inside: avoid;
			padding: 0.55cm 0.6cm;
		}

		.invite-card__body,
		.invite-card__code {
			border-top-color: rgba(0, 0, 0, 0.25) !important;
		}

		.invite-card__conf {
			color: #000 !important;
		}
		.invite-card__committee,
		.invite-card__meta {
			color: #333 !important;
		}
		.invite-card__name {
			color: #000 !important;
		}
		.invite-card__code-label {
			color: #555 !important;
		}
		.invite-card__code-value {
			color: #000 !important;
		}

		/* Make the emblem readable as a plain outlined mark in print. */
		:global(.invite-card .emblem) {
			color: #000 !important;
			background: #fff !important;
			border: 1px solid #000 !important;
			box-shadow: none !important;
		}
	}
</style>
