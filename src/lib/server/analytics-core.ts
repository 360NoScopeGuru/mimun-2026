/**
 * Pure analytics primitives — no db, no `$env`, fully unit-tested. The db-bound
 * `analytics.ts` assembles vote vectors / event streams and calls these. Mirrors
 * the `ai-core` / `rateLimit-core` pure-vs-impure split.
 */

export type Choice = 'for' | 'against' | 'abstain' | 'pass';

/** A delegate's choices across an ordered set of votes (null = didn't cast). */
export type VoteVector = { delegateId: string; choices: (Choice | null)[] };

// for = agree (+1), against = oppose (-1), abstain = neutral (0). pass / not-cast
// carry no signal and are skipped from the overlap entirely.
function encode(c: Choice | null): number | null {
	if (c === 'for') return 1;
	if (c === 'against') return -1;
	if (c === 'abstain') return 0;
	return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cosine alignment of two delegates over the votes they BOTH cast on. Returns
 * -1 (always opposed) … 0 (no relationship) … 1 (always together). Votes either
 * delegate skipped (or passed on) are ignored. Zero overlap → 0.
 */
export function alignment(a: (Choice | null)[], b: (Choice | null)[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	let overlap = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		const x = encode(a[i]);
		const y = encode(b[i]);
		if (x === null || y === null) continue;
		overlap++;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	if (overlap === 0 || na === 0 || nb === 0) return 0;
	return round2(dot / Math.sqrt(na * nb));
}

export type BlocResult = {
	/** Delegates grouped by mutual voting alignment (largest bloc first). */
	blocs: string[][];
	/** Symmetric alignment matrix in the same order as `vectors`. */
	matrix: number[][];
	/** Delegate ids in matrix order. */
	order: string[];
};

/**
 * Greedy single-pass clustering: seed a bloc with the first unassigned delegate,
 * then pull in every other unassigned delegate whose alignment to the seed meets
 * the threshold. Good enough to surface the obvious voting blocs for a heatmap;
 * not a statistical clustering claim.
 */
export function clusterBlocs(vectors: VoteVector[], threshold = 0.6): BlocResult {
	const order = vectors.map((v) => v.delegateId);
	const matrix = vectors.map((a) => vectors.map((b) => alignment(a.choices, b.choices)));
	const assigned = new Set<number>();
	const blocs: string[][] = [];

	for (let i = 0; i < vectors.length; i++) {
		if (assigned.has(i)) continue;
		assigned.add(i);
		const bloc = [i];
		for (let j = i + 1; j < vectors.length; j++) {
			if (assigned.has(j)) continue;
			if (matrix[i][j] >= threshold) {
				assigned.add(j);
				bloc.push(j);
			}
		}
		blocs.push(bloc.map((k) => vectors[k].delegateId));
	}

	blocs.sort((x, y) => y.length - x.length);
	return { blocs, matrix, order };
}

/**
 * Bucket event timestamps (epoch ms) into fixed windows from the first event,
 * for an engagement sparkline. Returns ascending `{ t, count }`.
 */
export function bucketTimeline(times: number[], bucketMs = 5 * 60_000): { t: number; count: number }[] {
	if (times.length === 0) return [];
	const start = Math.min(...times);
	const buckets = new Map<number, number>();
	for (const at of times) {
		const b = start + Math.floor((at - start) / bucketMs) * bucketMs;
		buckets.set(b, (buckets.get(b) ?? 0) + 1);
	}
	return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, count]) => ({ t, count }));
}
