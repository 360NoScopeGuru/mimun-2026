import { describe, it, expect } from 'vitest';
import { windowStart, decide, type RateRule } from './rateLimit-core';

const RULE: RateRule = { limit: 3, windowMs: 60_000 };

describe('windowStart', () => {
	it('buckets a timestamp down to the window boundary', () => {
		expect(windowStart(0, 60_000)).toBe(0);
		expect(windowStart(59_999, 60_000)).toBe(0);
		expect(windowStart(60_000, 60_000)).toBe(60_000);
		expect(windowStart(125_000, 60_000)).toBe(120_000);
	});
});

describe('decide', () => {
	it('allows the first request in a fresh window', () => {
		const d = decide(null, 1_000, RULE);
		expect(d).toMatchObject({ allowed: true, count: 1, remaining: 2, windowStart: 0 });
		expect(d.resetMs).toBe(59_000); // 60_000 - 1_000
	});

	it('increments within the same window', () => {
		const d = decide({ windowStart: 0, count: 2 }, 5_000, RULE);
		expect(d).toMatchObject({ allowed: true, count: 3, remaining: 0 });
	});

	it('blocks once the limit is exceeded', () => {
		const d = decide({ windowStart: 0, count: 3 }, 5_000, RULE);
		expect(d).toMatchObject({ allowed: false, count: 4, remaining: 0 });
	});

	it('keeps blocking while the client keeps hammering the same window', () => {
		const d = decide({ windowStart: 0, count: 9 }, 5_000, RULE);
		expect(d.allowed).toBe(false);
		expect(d.count).toBe(10);
	});

	it('resets to 1 when the stored window is stale', () => {
		// prev was in window [0,60k); now is in the next window → fresh budget.
		const d = decide({ windowStart: 0, count: 3 }, 61_000, RULE);
		expect(d).toMatchObject({ allowed: true, count: 1, remaining: 2, windowStart: 60_000 });
	});

	it('reports the time remaining until the window rolls over', () => {
		expect(decide(null, 60_000, RULE).resetMs).toBe(60_000); // start of window
		expect(decide(null, 119_000, RULE).resetMs).toBe(1_000); // 1s before rollover
	});
});
