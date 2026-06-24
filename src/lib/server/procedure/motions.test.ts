import { describe, it, expect } from 'vitest';
import { motionPrecedence, sortByPrecedence, substantiveMajority, needsSecondRound } from './motions';
import { THIMUN } from './config';

describe('motion precedence', () => {
	it('ranks disruptive motions above caucuses', () => {
		expect(motionPrecedence('adjourn_debate')).toBeGreaterThan(motionPrecedence('moderated_caucus'));
		expect(motionPrecedence('unmoderated_caucus')).toBeGreaterThan(motionPrecedence('moderated_caucus'));
	});
	it('returns 0 for unknown motions', () => {
		expect(motionPrecedence('nonsense')).toBe(0);
	});
});

describe('sortByPrecedence', () => {
	it('orders by precedence desc, then oldest-first', () => {
		const t0 = '2026-06-24T10:00:00.000Z';
		const t1 = '2026-06-24T10:01:00.000Z';
		const t2 = '2026-06-24T10:02:00.000Z';
		const sorted = sortByPrecedence([
			{ type: 'moderated_caucus', createdAt: t0 },
			{ type: 'move_to_voting', createdAt: t2 },
			{ type: 'moderated_caucus', createdAt: t1 }
		]);
		expect(sorted.map((m) => m.type)).toEqual(['move_to_voting', 'moderated_caucus', 'moderated_caucus']);
		// the two equal-precedence caucuses keep FIFO order
		expect(sorted[1].createdAt).toBe(t0);
		expect(sorted[2].createdAt).toBe(t1);
	});
});

describe('substantiveMajority', () => {
	it('uses the preset rules', () => {
		expect(substantiveMajority(THIMUN, 'resolution')).toBe('simple');
		expect(substantiveMajority(THIMUN, 'amendment')).toBe('simple');
	});
});

describe('needsSecondRound', () => {
	it('is true only when a delegation passed', () => {
		expect(needsSecondRound(['for', 'against', 'pass'])).toBe(true);
		expect(needsSecondRound(['for', 'against', 'abstain'])).toBe(false);
	});
});
