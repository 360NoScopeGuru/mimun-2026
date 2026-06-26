<script lang="ts">
	import type { PageData } from './$types';
	import type { ParticipationRow } from '$lib/server/participation';

	let { data }: { data: PageData } = $props();

	type SortKey = 'delegation' | 'speeches' | 'messages' | 'motions' | 'amendments' | 'points' | 'votes' | 'score';

	const numericColumns: { key: Exclude<SortKey, 'delegation'>; label: string }[] = [
		{ key: 'speeches', label: 'Speeches' },
		{ key: 'messages', label: 'Messages' },
		{ key: 'motions', label: 'Motions' },
		{ key: 'amendments', label: 'Amendments' },
		{ key: 'points', label: 'Points' },
		{ key: 'votes', label: 'Votes' },
		{ key: 'score', label: 'Score' }
	];

	let sortKey = $state<SortKey>('score');
	let sortDir = $state<'asc' | 'desc'>('desc');

	function setSort(key: SortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'desc' ? 'asc' : 'desc';
		} else {
			sortKey = key;
			// Names read best A→Z; tallies read best high→low.
			sortDir = key === 'delegation' ? 'asc' : 'desc';
		}
	}

	const label = (r: ParticipationRow) => r.country || r.name;

	const sorted = $derived(
		[...data.rows].sort((a, b) => {
			let cmp: number;
			if (sortKey === 'delegation') {
				cmp = label(a).localeCompare(label(b));
			} else {
				cmp = a[sortKey] - b[sortKey];
			}
			if (cmp === 0) cmp = b.score - a.score; // stable secondary: stronger delegations first
			return sortDir === 'asc' ? cmp : -cmp;
		})
	);

	// Rank by score, independent of the current display sort, so the medal
	// positions don't shuffle when chairs re-sort by a single metric.
	const rankById = $derived(
		new Map(
			[...data.rows]
				.sort((a, b) => b.score - a.score)
				.map((r, i) => [r.delegateId, i + 1] as const)
		)
	);

	function arrow(key: SortKey) {
		if (sortKey !== key) return '';
		return sortDir === 'desc' ? '↓' : '↑';
	}

	function exportCsv() {
		const cols = ['Rank', 'Country', 'Delegate', 'Speeches', 'Messages', 'Motions', 'Amendments', 'Points', 'Votes', 'Score'];
		const esc = (v: string | number) => {
			const s = String(v);
			return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
		};
		const lines = [cols.join(',')];
		// Export in score order regardless of the current display sort.
		const ordered = [...data.rows].sort((a, b) => b.score - a.score);
		for (const r of ordered) {
			lines.push(
				[rankById.get(r.delegateId) ?? '', r.country, r.name, r.speeches, r.messages, r.motions, r.amendments, r.points, r.votes, r.score]
					.map(esc)
					.join(',')
			);
		}
		const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `participation-${data.committee.slug}.csv`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	// AI session summary (chair rapporteur)
	let summary = $state('');
	let summaryProvider = $state('');
	let summarizing = $state(false);
	let summaryError = $state('');

	async function generateSummary() {
		if (summarizing) return;
		summarizing = true;
		summaryError = '';
		summary = '';
		try {
			const res = await fetch(`/committee/${data.committee.slug}/summary`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) summaryError = body.message || 'Could not generate a summary right now.';
			else {
				summary = body.summary;
				summaryProvider = body.provider;
			}
		} catch {
			summaryError = 'Could not reach the summariser.';
		} finally {
			summarizing = false;
		}
	}

	// AI award recommendations (chair) — grounded in the measured activity.
	type Award = { award: string; delegate: string; reason: string };
	let awards = $state<Award[]>([]);
	let awardsProvider = $state('');
	let recommending = $state(false);
	let awardsError = $state('');

	async function generateAwards() {
		if (recommending) return;
		recommending = true;
		awardsError = '';
		awards = [];
		try {
			const res = await fetch(`/committee/${data.committee.slug}/analytics/awards`, { method: 'POST' });
			const body = await res.json().catch(() => ({}));
			if (!res.ok) awardsError = body.message || 'Could not generate awards right now.';
			else {
				awards = body.awards ?? [];
				awardsProvider = body.provider;
			}
		} catch {
			awardsError = 'Could not reach the awards service.';
		} finally {
			recommending = false;
		}
	}

	// Heatmap cell colour: green = aligned, red = opposed, faint = neutral.
	function cellColor(v: number): string {
		if (v > 0) return `rgba(91,191,143,${Math.min(0.85, 0.15 + v * 0.7)})`;
		if (v < 0) return `rgba(217,105,78,${Math.min(0.85, 0.15 + -v * 0.7)})`;
		return 'rgba(255,255,255,0.05)';
	}
	const maxBucket = $derived(Math.max(1, ...data.engagement.timeline.map((b) => b.count)));
</script>

<svelte:head><title>Participation — {data.committee.name}</title></svelte:head>

<div class="min-h-[calc(100vh-57px)] px-6 py-8 lg:px-10">
	<div class="mx-auto max-w-5xl">
		<!-- header -->
		<div class="flex flex-wrap items-end justify-between gap-4">
			<div>
				<a href="/committee/{data.committee.slug}" class="btn btn-quiet focus-ring -ml-2 mb-2 px-2 py-1 text-xs">← {data.committee.name}</a>
				<h1 class="display text-3xl text-ink-50">Participation</h1>
				<p class="label mt-2">Activity by delegation — for awards</p>
			</div>
			<button type="button" class="btn btn-brass focus-ring px-4 py-2 text-sm" onclick={exportCsv}>Export CSV</button>
		</div>

		<!-- AI session summary -->
		{#if data.aiConfigured}
			<div class="card mt-6 p-5">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p class="label label-brass">Session summary</p>
						<p class="mt-1 text-xs text-ink-500">
							A rapporteur-style recap drawn from attendance, debate, motions, and votes.
						</p>
					</div>
					<button
						type="button"
						onclick={generateSummary}
						disabled={summarizing}
						class="btn btn-brass focus-ring px-4 py-2 text-sm disabled:opacity-40"
					>
						{summarizing ? 'Writing…' : summary ? 'Regenerate' : 'Generate'}
					</button>
				</div>
				{#if summaryError}<p class="mt-3 text-sm text-signal-amber">{summaryError}</p>{/if}
				{#if summary}
					<div
						class="mt-4 whitespace-pre-wrap rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-sm leading-relaxed text-ink-200"
					>
						{summary}
					</div>
					{#if summaryProvider}<p class="label mt-2 text-[0.55rem] text-ink-600">via {summaryProvider}</p>{/if}
				{/if}
			</div>
		{/if}

		<!-- table -->
		<div class="card mt-6 overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="border-b border-white/[0.07] text-left">
						<th class="w-12 px-4 py-3">
							<span class="label text-[0.6rem] text-ink-500">#</span>
						</th>
						<th class="px-4 py-3">
							<button type="button" class="label focus-ring inline-flex items-center gap-1 text-[0.65rem] transition-colors hover:text-ink-100 {sortKey === 'delegation' ? 'text-ink-100' : ''}" onclick={() => setSort('delegation')}>
								Delegation <span class="text-brass-400">{arrow('delegation')}</span>
							</button>
						</th>
						{#each numericColumns as col (col.key)}
							<th class="px-4 py-3 text-right">
								<button type="button" class="label focus-ring ml-auto inline-flex items-center gap-1 text-[0.65rem] transition-colors hover:text-ink-100 {sortKey === col.key ? 'text-ink-100' : ''}" onclick={() => setSort(col.key)}>
									<span class="text-brass-400">{arrow(col.key)}</span> {col.label}
								</button>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each sorted as r (r.delegateId)}
						{@const rank = rankById.get(r.delegateId) ?? 0}
						<tr class="border-b border-white/[0.06] last:border-0 transition-colors hover:bg-white/[0.02] {rank === 1 ? 'bg-brass-500/[0.06]' : ''}">
							<td class="px-4 py-3">
								<span class="font-mono text-xs tabular-nums {rank === 1 ? 'text-brass-300' : 'text-ink-400'}">{rank}</span>
							</td>
							<td class="px-4 py-3">
								<p class="font-medium {rank === 1 ? 'text-brass-300' : 'text-ink-100'}">{r.country || r.name}</p>
								{#if r.country}<p class="text-xs text-ink-400">{r.name}</p>{/if}
							</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-ink-200">{r.speeches}</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-ink-200">{r.messages}</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-ink-200">{r.motions}</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-ink-200">{r.amendments}</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-ink-200">{r.points}</td>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-ink-200">{r.votes}</td>
							<td class="px-4 py-3 text-right font-mono font-semibold tabular-nums {rank === 1 ? 'text-brass-300' : 'text-ink-50'}">{r.score}</td>
						</tr>
					{:else}
						<tr>
							<td colspan={2 + numericColumns.length} class="px-4 py-10 text-center text-sm text-ink-400">No active delegations in this committee yet.</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<p class="label mt-4 text-ink-500">Score = speeches·3 + motions·2 + amendments·2 + points·1 + messages·0.5 + votes·0.5</p>

		<!-- ── AI award recommendations ──────────────────────────────── -->
		<div class="card mt-8 p-5">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p class="label label-brass">Award recommendations</p>
					<p class="mt-1 text-xs text-ink-500">Defensible picks grounded only in measured activity — each with its justification.</p>
				</div>
				{#if data.aiConfigured}
					<button type="button" onclick={generateAwards} disabled={recommending} class="btn btn-brass focus-ring px-4 py-2 text-sm disabled:opacity-40">
						{recommending ? 'Deliberating…' : awards.length ? 'Regenerate' : 'Recommend awards'}
					</button>
				{:else}
					<span class="text-xs text-ink-500">AI not configured</span>
				{/if}
			</div>
			{#if awardsError}<p class="mt-3 text-sm text-signal-amber">{awardsError}</p>{/if}
			{#if awards.length}
				<div class="mt-4 grid gap-3 sm:grid-cols-2">
					{#each awards as a (a.award + a.delegate)}
						<div class="rounded-xl border border-brass-400/20 bg-brass-400/[0.04] p-4">
							<p class="label label-brass">{a.award}</p>
							<p class="mt-1 text-base font-semibold text-ink-50">{a.delegate}</p>
							<p class="mt-1 text-sm leading-relaxed text-ink-300">{a.reason}</p>
						</div>
					{/each}
				</div>
				{#if awardsProvider}<p class="label mt-2 text-[0.55rem] text-ink-600">via {awardsProvider}</p>{/if}
			{/if}
		</div>

		<!-- ── Voting blocs heatmap ──────────────────────────────────── -->
		{#if data.blocs.votes > 0}
			<div class="card mt-4 p-5">
				<p class="label label-brass">Voting blocs</p>
				<p class="mt-1 text-xs text-ink-500">
					Who voted together across {data.blocs.votes} vote{data.blocs.votes === 1 ? '' : 's'} — <span class="text-signal-green">green</span> aligned, <span class="text-signal-red">red</span> opposed.
				</p>
				{#if data.blocs.blocs.some((b) => b.members.length > 1)}
					<div class="mt-3 flex flex-wrap gap-2">
						{#each data.blocs.blocs as b, i (i)}
							{#if b.members.length > 1}
								<span class="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-ink-200"><span class="text-brass-400">Bloc {i + 1}</span> · {b.members.join(', ')}</span>
							{/if}
						{/each}
					</div>
				{/if}
				<div class="mt-4 space-y-0.5 overflow-x-auto pb-1">
					{#each data.blocs.delegates as d, i (d.id)}
						<div class="flex items-center gap-2">
							<span class="w-28 shrink-0 truncate text-right text-[0.7rem] text-ink-300" title={d.label}>{d.label}</span>
							<div class="flex gap-0.5">
								{#each data.blocs.matrix[i] as v, j (j)}
									<span class="h-4 w-4 shrink-0 rounded-[3px]" style="background: {cellColor(v)};" title="{d.label} vs {data.blocs.delegates[j].label}: {v}"></span>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- ── Engagement over time ──────────────────────────────────── -->
		<div class="card mt-4 p-5">
			<p class="label label-brass">Engagement over time</p>
			<div class="mt-3 flex h-20 items-end gap-1">
				{#each data.engagement.timeline as b (b.t)}
					<div class="flex-1 rounded-t bg-brass-500/60" style="height: {(b.count / maxBucket) * 100}%" title="{b.count} actions"></div>
				{:else}
					<p class="text-sm text-ink-500">No activity yet.</p>
				{/each}
			</div>
			<div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-400">
				<span><span class="font-mono text-ink-100">{data.engagement.totals.messages}</span> messages</span>
				<span><span class="font-mono text-ink-100">{data.engagement.totals.speeches}</span> speeches</span>
				<span><span class="font-mono text-ink-100">{data.engagement.totals.motions}</span> motions</span>
				<span><span class="font-mono text-ink-100">{data.engagement.totals.ballots}</span> ballots cast</span>
			</div>
		</div>

		<!-- ── Negotiation network ───────────────────────────────────── -->
		{#if data.network.length}
			<div class="card mt-4 p-5">
				<p class="label label-brass">Negotiation network</p>
				<p class="mt-1 text-xs text-ink-500">Private notes passed between delegations, busiest first.</p>
				<ul class="mt-3 space-y-1.5">
					{#each data.network.slice(0, 12) as e (e.from + '→' + e.to)}
						<li class="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-sm">
							<span class="text-ink-200">{e.from} <span class="text-ink-500">→</span> {e.to}</span>
							<span class="font-mono text-xs text-ink-400">{e.count} note{e.count === 1 ? '' : 's'}{#if e.avgReplyLagSec !== null} · {e.avgReplyLagSec < 60 ? e.avgReplyLagSec + 's' : Math.round(e.avgReplyLagSec / 60) + 'm'} reply{/if}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
</div>
