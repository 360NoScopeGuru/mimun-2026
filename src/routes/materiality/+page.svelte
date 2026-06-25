<script lang="ts">
	// ── Materiality study ────────────────────────────────────────────────
	// A throwaway preview route. Same "Chamber & Paper" tokens as the rest of
	// the app — this page only adds *physical depth*: skeuomorphic objects
	// (placard, paper, wax seal) and surgical neumorphism (press-to-cast).
	// Nothing else in the app imports any of this. Delete the folder to revert.

	type Vote = 'for' | 'against' | 'abstain';

	let cast = $state<Vote | null>(null);
	let flat = $state(false);

	function vote(choice: Vote) {
		cast = cast === choice ? null : choice; // toggle: re-tap lowers the placard
	}

	const glow = $derived(
		cast === 'for'
			? 'rgba(91, 191, 143, 0.5)'
			: cast === 'against'
				? 'rgba(217, 105, 78, 0.5)'
				: cast === 'abstain'
					? 'rgba(151, 160, 178, 0.42)'
					: 'transparent'
	);

	const castLabel = $derived(
		cast === 'for'
			? 'Placard raised — France votes in favour.'
			: cast === 'against'
				? 'Placard raised — France votes against.'
				: cast === 'abstain'
					? 'Placard raised — France abstains.'
					: 'Placard lowered. Tap a card to cast.'
	);
</script>

<svelte:head><title>Materiality study · MIMUN 2026</title></svelte:head>

<div class="study" class:flat>
	<header class="intro">
		<p class="label label-brass">Design study · not wired into the app</p>
		<h1 class="display">A sense of material</h1>
		<p class="lede">
			Same palette, same type, same two surfaces — given weight and light. The Chamber gains
			tactile objects you can press; the Paper gains the feel of a tabled document. Toggle it flat
			to compare against today's look.
		</p>
		<button class="switch" onclick={() => (flat = !flat)} aria-pressed={!flat}>
			<span class="switch-track"><span class="switch-thumb"></span></span>
			{flat ? 'Flat (today)' : 'Material (preview)'}
		</button>
	</header>

	<div class="grid">
		<!-- ── CHAMBER ────────────────────────────────────────────────── -->
		<section class="surface-chamber panel">
			<p class="label">Chamber · the live floor</p>

			<article class="ch-card">
				<div class="ch-head">
					<div>
						<p class="ch-eyebrow label">General Assembly · Third Committee</p>
						<h2 class="ch-title">Vote — Draft Resolution GA/1.1</h2>
					</div>
					<span class="designation-chip">GA/1.1</span>
				</div>

				<div class="desk">
					<div class="placard" class:raised={cast !== null} data-vote={cast} style:--glow={glow}>
						<span class="placard-country">FRANCE</span>
					</div>
				</div>

				<div class="ballot" role="group" aria-label="Cast your vote">
					<button class="chip for" class:sel={cast === 'for'} aria-pressed={cast === 'for'} onclick={() => vote('for')}>
						<span class="dot"></span>For
					</button>
					<button class="chip against" class:sel={cast === 'against'} aria-pressed={cast === 'against'} onclick={() => vote('against')}>
						<span class="dot"></span>Against
					</button>
					<button class="chip abstain" class:sel={cast === 'abstain'} aria-pressed={cast === 'abstain'} onclick={() => vote('abstain')}>
						<span class="dot"></span>Abstain
					</button>
				</div>

				<p class="cast-status" aria-live="polite">{castLabel}</p>
			</article>

			<p class="caption label">Skeuomorphic placard, seated in the desk · surgical neumorphism on cast</p>
		</section>

		<!-- ── PAPER ──────────────────────────────────────────────────── -->
		<section class="surface-paper panel">
			<p class="label paper-label">Paper · the record</p>

			<article class="sheet">
				<p class="pa-designation">Resolution GA/1.1</p>
				<h2 class="pa-title display">Cooperation on the protection of climate-displaced persons</h2>
				<p class="pa-meta">
					Submitted by <strong>France</strong> · Co-submitters: Kenya, Tuvalu, Germany
				</p>

				<div class="rule rule-brass pa-rule"></div>

				<p class="pa-organ">The General Assembly,</p>

				<p class="clause pre"><em>Recalling</em> its resolution 70/1 of 25 September 2015 on sustainable development,</p>
				<p class="clause pre"><em>Deeply concerned</em> by the displacement of low-lying island communities owing to rising sea levels,</p>

				<ol class="ops">
					<li class="clause op"><span class="n">1.</span><span><em>Calls upon</em> Member States to establish a coordinated framework for the protection of climate-displaced persons;</span></li>
					<li class="clause op"><span class="n">2.</span><span><em>Urges</em> the creation of a dedicated adaptation and relocation fund;</span></li>
					<li class="clause op"><span class="n">3.</span><span><em>Decides</em> to remain seized of the matter.</span></li>
				</ol>

				<div class="adoption">
					<p class="signature">The President</p>
					<p class="adoption-meta label">Adopted in plenary · 24 June 2026</p>
				</div>

				<div class="seal" aria-label="Adopted">
					<span class="seal-star">★</span>
					<span class="seal-word">ADOPTED</span>
				</div>
			</article>

			<p class="caption label paper-caption">Floating sheet, fibre grain · letterpress numerals · wax seal</p>
		</section>
	</div>
</div>

<style>
	/* ── Page shell ─────────────────────────────────────────────────── */
	.study {
		max-width: 1180px;
		margin: 0 auto;
		padding: 3.5rem 1.5rem 6rem;
	}

	.intro {
		max-width: 46rem;
		margin-bottom: 2.5rem;
	}
	.intro h1 {
		font-size: clamp(2.25rem, 5vw, 3.25rem);
		margin: 0.5rem 0 0.75rem;
		color: var(--color-ink-50);
	}
	.lede {
		color: var(--color-ink-300);
		line-height: 1.6;
		max-width: 38rem;
	}

	/* Material/flat toggle — itself a tactile control */
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.625rem;
		margin-top: 1.5rem;
		padding: 0.5rem 0.9rem 0.5rem 0.55rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: linear-gradient(180deg, var(--color-ink-700), var(--color-ink-800));
		color: var(--color-ink-100);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 14px -8px rgba(0, 0, 0, 0.8);
	}
	.switch-track {
		width: 34px;
		height: 20px;
		border-radius: 999px;
		background: var(--color-ink-900);
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.7);
		position: relative;
		transition: background-color 0.2s var(--ease-out-soft);
	}
	.switch[aria-pressed='true'] .switch-track {
		background: var(--color-brass-600);
	}
	.switch-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: linear-gradient(180deg, #fff, #cdd2dd);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
		transition: transform 0.2s var(--ease-out-soft);
	}
	.switch[aria-pressed='true'] .switch-thumb {
		transform: translateX(14px);
	}

	.grid {
		display: grid;
		gap: 1.5rem;
		grid-template-columns: 1fr;
	}
	@media (min-width: 900px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	.panel {
		border-radius: 1.25rem;
		padding: 1.75rem;
	}
	.surface-chamber.panel {
		border: 1px solid rgba(255, 255, 255, 0.06);
		box-shadow: 0 30px 60px -40px rgba(0, 0, 0, 0.9);
	}
	.surface-paper.panel {
		border: 1px solid var(--color-paper-200);
	}
	.panel > .label {
		margin-bottom: 1.25rem;
		display: block;
	}
	.paper-label {
		color: var(--color-paper-ink-500);
	}

	.caption {
		margin-top: 1.1rem;
		display: block;
		font-size: 0.6rem;
		color: var(--color-ink-400);
	}
	.paper-caption {
		color: var(--color-paper-ink-500);
	}

	/* ── Chamber: elevated card ─────────────────────────────────────── */
	.ch-card {
		position: relative;
		border-radius: 1rem;
		padding: 1.5rem;
		background: linear-gradient(180deg, var(--color-ink-700), var(--color-ink-850));
		border: 1px solid rgba(255, 255, 255, 0.05);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.08),
			inset 0 -1px 0 rgba(0, 0, 0, 0.45),
			0 1px 2px rgba(0, 0, 0, 0.5),
			0 26px 50px -28px rgba(0, 0, 0, 0.95);
		overflow: hidden;
	}
	/* faint woven-felt grain on the card */
	.ch-card::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		opacity: 0.04;
		mix-blend-mode: overlay;
	}

	.ch-head {
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.ch-eyebrow {
		color: var(--color-brass-400);
		margin-bottom: 0.35rem;
	}
	.ch-title {
		font-family: var(--font-display);
		font-weight: 500;
		font-size: 1.3rem;
		line-height: 1.15;
		color: var(--color-ink-50);
	}
	.designation-chip {
		flex: none;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--color-brass-200);
		padding: 0.3rem 0.55rem;
		border-radius: 0.5rem;
		background: rgba(0, 0, 0, 0.3);
		box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6), inset 0 -1px 0 rgba(255, 255, 255, 0.04);
	}

	/* The desk: a recessed well the placard sits in */
	.desk {
		position: relative;
		margin-top: 1.4rem;
		border-radius: 0.85rem;
		padding: 2rem 1.25rem 2.25rem;
		background: linear-gradient(180deg, var(--color-ink-900), var(--color-ink-850));
		box-shadow:
			inset 0 3px 8px rgba(0, 0, 0, 0.75),
			inset 0 -1px 0 rgba(255, 255, 255, 0.03);
		display: flex;
		justify-content: center;
		perspective: 600px;
	}

	/* The placard — a physical name card */
	.placard {
		position: relative;
		padding: 0.95rem 2.25rem;
		border-radius: 0.5rem;
		background: linear-gradient(177deg, var(--color-ink-600) 0%, var(--color-ink-800) 58%, var(--color-ink-900) 100%);
		border: 1px solid rgba(0, 0, 0, 0.5);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.1),
			inset 0 -2px 4px rgba(0, 0, 0, 0.5),
			0 10px 18px -8px rgba(0, 0, 0, 0.85);
		transition:
			transform 0.32s var(--ease-out-soft),
			box-shadow 0.32s var(--ease-out-soft);
	}
	/* diagonal specular sheen */
	.placard::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		background: linear-gradient(118deg, transparent 40%, rgba(255, 255, 255, 0.06) 48%, transparent 56%);
	}
	/* brass nameplate underline */
	.placard::after {
		content: '';
		position: absolute;
		left: 1rem;
		right: 1rem;
		bottom: 0.55rem;
		height: 2px;
		border-radius: 2px;
		background: linear-gradient(90deg, transparent, var(--color-brass-400), transparent);
		box-shadow: 0 0 8px var(--color-brass-glow);
	}
	.placard-country {
		position: relative;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 1.55rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-50);
		text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
	}
	/* raised = delegate has lifted the placard to vote */
	.placard.raised {
		transform: translateY(-14px) rotateX(6deg);
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.14),
			0 24px 38px -12px var(--glow),
			0 12px 20px -8px rgba(0, 0, 0, 0.85);
	}

	/* Ballot: surgical neumorphism — chips press in and light up */
	.ballot {
		position: relative;
		margin-top: 1.5rem;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.75rem;
	}
	.chip {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.85rem 0.5rem;
		border-radius: 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.07);
		background: linear-gradient(180deg, var(--color-ink-700), var(--color-ink-800));
		color: var(--color-ink-100);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.08),
			0 6px 12px -6px rgba(0, 0, 0, 0.8);
		transition:
			transform 0.12s ease,
			box-shadow 0.18s ease,
			background-color 0.18s ease,
			color 0.18s ease;
	}
	.chip .dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--c);
		box-shadow: 0 0 6px var(--c);
	}
	.chip.for {
		--c: var(--color-vote-for);
	}
	.chip.against {
		--c: var(--color-vote-against);
	}
	.chip.abstain {
		--c: var(--color-vote-abstain);
	}
	.chip:hover {
		transform: translateY(-1px);
		border-color: rgba(255, 255, 255, 0.16);
	}
	.chip:active {
		transform: translateY(1px);
	}
	/* selected = pressed into the surface, illuminated in its signal colour */
	.chip.sel {
		background: var(--c);
		color: #0a0f1d;
		border-color: transparent;
		transform: translateY(1px);
		box-shadow:
			inset 0 2px 6px rgba(0, 0, 0, 0.35),
			0 0 0 1px var(--c),
			0 0 20px -2px var(--c);
	}
	.chip.sel .dot {
		background: rgba(10, 15, 29, 0.55);
		box-shadow: none;
	}
	.chip.abstain.sel {
		color: #10151f;
	}

	.cast-status {
		position: relative;
		margin-top: 1.1rem;
		font-size: 0.8rem;
		color: var(--color-ink-300);
		text-align: center;
		min-height: 1.2em;
	}

	/* ── Paper: floating sheet ──────────────────────────────────────── */
	.sheet {
		position: relative;
		max-width: 30rem;
		margin: 0 auto;
		padding: 2.5rem 2.25rem 2.25rem;
		background: var(--color-paper-50);
		border: 1px solid var(--color-paper-200);
		border-radius: 3px;
		box-shadow:
			0 1px 1px rgba(60, 50, 30, 0.16),
			0 14px 30px -12px rgba(60, 50, 30, 0.32),
			0 44px 64px -34px rgba(60, 50, 30, 0.42);
	}
	/* paper fibre grain */
	.sheet::before {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		border-radius: inherit;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E");
		opacity: 0.045;
		mix-blend-mode: multiply;
	}
	.sheet > * {
		position: relative;
	}
	.pa-designation {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--color-paper-ink-500);
	}
	.pa-title {
		font-size: 1.5rem;
		color: var(--color-paper-ink-900);
		margin: 0.5rem 0 0.6rem;
		line-height: 1.12;
	}
	.pa-meta {
		font-size: 0.8rem;
		color: var(--color-paper-ink-500);
	}
	.pa-meta strong {
		color: var(--color-paper-ink-700);
	}
	.pa-rule {
		margin: 1.1rem 0;
		opacity: 0.6;
	}
	.pa-organ {
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--color-paper-ink-900);
		margin-bottom: 0.75rem;
	}
	.clause {
		font-size: 0.92rem;
		line-height: 1.55;
		color: var(--color-paper-ink-700);
		margin-bottom: 0.5rem;
	}
	.clause em {
		/* letterpress deboss: dark ink with a hairline light edge below */
		font-style: italic;
		color: var(--color-paper-ink-900);
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.75);
	}
	.ops {
		list-style: none;
		counter-reset: none;
		margin: 0.25rem 0 0;
		padding: 0;
	}
	.clause.op {
		display: flex;
		gap: 0.85rem;
	}
	.clause.op .n {
		font-family: var(--font-mono);
		font-weight: 600;
		color: var(--color-paper-ink-700);
		text-shadow: 0 1px 0 rgba(255, 255, 255, 0.8);
	}

	.adoption {
		margin-top: 1.75rem;
		padding-top: 0.5rem;
	}
	.adoption .signature {
		font-size: 2.1rem;
		color: var(--color-paper-ink-900);
		line-height: 0.9;
	}
	.adoption-meta {
		color: var(--color-paper-ink-500);
		margin-top: 0.35rem;
	}

	/* The wax seal — pressed onto the corner of the sheet */
	.seal {
		position: absolute;
		right: -1.1rem;
		bottom: 1.4rem;
		width: 94px;
		height: 94px;
		border-radius: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.05rem;
		transform: rotate(-8deg);
		background: radial-gradient(62% 58% at 36% 30%, #a8443a, #7a241c 64%, #561512 100%);
		box-shadow:
			inset 0 2px 5px rgba(255, 255, 255, 0.28),
			inset 0 -7px 14px rgba(0, 0, 0, 0.5),
			0 7px 12px -3px rgba(40, 10, 8, 0.6);
	}
	/* embossed inner ring */
	.seal::before {
		content: '';
		position: absolute;
		inset: 9px;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.28);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
	}
	.seal-star {
		font-size: 0.85rem;
		color: #f0cdb6;
		text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.4), 0 1px 0 rgba(255, 255, 255, 0.15);
	}
	.seal-word {
		font-family: var(--font-accent);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: #f0cdb6;
		text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.45), 0 1px 0 rgba(255, 255, 255, 0.12);
	}

	/* ── Flat mode: strip the depth back to ~today's look ───────────── */
	.flat .ch-card,
	.flat .placard,
	.flat .chip,
	.flat .switch,
	.flat .designation-chip {
		box-shadow: none;
	}
	.flat .ch-card {
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.012));
		border-color: rgba(255, 255, 255, 0.07);
	}
	.flat .ch-card::before,
	.flat .sheet::before,
	.flat .placard::before,
	.flat .placard::after {
		display: none;
	}
	.flat .desk {
		background: transparent;
		box-shadow: none;
		border: 1px dashed rgba(255, 255, 255, 0.08);
	}
	.flat .placard {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.1);
		transform: none;
	}
	.flat .placard.raised {
		transform: none;
		box-shadow: none;
	}
	.flat .chip {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.12);
	}
	.flat .chip.sel {
		background: var(--c);
	}
	.flat .sheet {
		box-shadow: 0 1px 0 var(--color-paper-line);
		border: 1px solid var(--color-paper-200);
	}
	.flat .clause em,
	.flat .clause.op .n {
		text-shadow: none;
	}
	.flat .seal {
		background: transparent;
		border: 1.5px solid #7a241c;
		color: #7a241c;
		box-shadow: none;
	}
	.flat .seal::before {
		display: none;
	}
	.flat .seal-star,
	.flat .seal-word {
		color: #7a241c;
		text-shadow: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.placard,
		.chip,
		.switch-thumb,
		.switch-track {
			transition: none;
		}
	}
</style>
