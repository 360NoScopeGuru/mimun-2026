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
	</div>
</div>
