import { describe, it, expect } from 'vitest';
import { alignment, clusterBlocs, bucketTimeline, type VoteVector } from './analytics-core';

describe('alignment', () => {
	it('is 1 for identical voting and -1 for opposite', () => {
		expect(alignment(['for', 'against', 'for'], ['for', 'against', 'for'])).toBe(1);
		expect(alignment(['for', 'against'], ['against', 'for'])).toBe(-1);
	});

	it('ignores votes either delegate skipped or passed on', () => {
		// Only the first vote overlaps (both 'for'); the rest are skipped → 1.
		expect(alignment(['for', null, 'pass'], ['for', 'against', 'for'])).toBe(1);
	});

	it('is 0 when there is no overlap or no signal', () => {
		expect(alignment([null, null], ['for', 'against'])).toBe(0);
		expect(alignment(['abstain', 'abstain'], ['abstain', 'abstain'])).toBe(0); // all-neutral, no magnitude
		expect(alignment([], [])).toBe(0);
	});
});

describe('clusterBlocs', () => {
	it('separates two clearly-opposed groups', () => {
		const vectors: VoteVector[] = [
			{ delegateId: 'a', choices: ['for', 'for', 'against'] },
			{ delegateId: 'b', choices: ['for', 'for', 'against'] }, // with a
			{ delegateId: 'c', choices: ['against', 'against', 'for'] },
			{ delegateId: 'd', choices: ['against', 'against', 'for'] } // with c
		];
		const { blocs, matrix, order } = clusterBlocs(vectors, 0.6);
		expect(blocs).toHaveLength(2);
		// a&b together, c&d together (order-independent check)
		const sets = blocs.map((b) => new Set(b));
		expect(sets.some((s) => s.has('a') && s.has('b'))).toBe(true);
		expect(sets.some((s) => s.has('c') && s.has('d'))).toBe(true);
		expect(order).toEqual(['a', 'b', 'c', 'd']);
		expect(matrix[0][1]).toBe(1); // a vs b
		expect(matrix[0][2]).toBe(-1); // a vs c
	});

	it('returns singletons when there is no alignment signal', () => {
		const vectors: VoteVector[] = [
			{ delegateId: 'a', choices: [] },
			{ delegateId: 'b', choices: [] }
		];
		expect(clusterBlocs(vectors).blocs).toHaveLength(2);
	});
});

describe('bucketTimeline', () => {
	it('buckets timestamps into fixed windows from the first event', () => {
		const base = 1_000_000;
		const out = bucketTimeline([base, base + 1000, base + 6 * 60_000], 5 * 60_000);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ t: base, count: 2 });
		expect(out[1].count).toBe(1);
	});

	it('is empty for no events', () => {
		expect(bucketTimeline([])).toEqual([]);
	});
});
