import type { MajorityRule } from './config';

export type BallotChoice = 'for' | 'against' | 'abstain' | 'pass';

export type Tally = {
	for: number;
	against: number;
	abstain: number;
	pass: number;
};

/** Tally a list of ballot choices. */
export function tallyBallots(choices: BallotChoice[]): Tally {
	const t: Tally = { for: 0, against: 0, abstain: 0, pass: 0 };
	for (const c of choices) t[c] += 1;
	return t;
}

/**
 * The base a majority is measured against: those "present and voting", i.e.
 * delegates who cast a for/against. Abstentions and passes do not count.
 */
export function majorityBase(t: Tally): number {
	return t.for + t.against;
}

/** Minimum "for" votes needed to carry, given the voting base and rule. */
export function requiredToPass(base: number, rule: MajorityRule): number {
	if (base <= 0) return 1;
	return rule === 'two_thirds' ? Math.ceil((base * 2) / 3) : Math.floor(base / 2) + 1;
}

/** Decide a vote. Ties fail; an empty base fails. */
export function decide(t: Tally, rule: MajorityRule): 'passed' | 'failed' {
	const base = majorityBase(t);
	if (base === 0) return 'failed';
	return t.for >= requiredToPass(base, rule) ? 'passed' : 'failed';
}

/* ------------------------------------------------------------------ *
 * Quorum
 * ------------------------------------------------------------------ */

/** Minimum number of members that must be present to conduct business. */
export function quorumThreshold(totalMembers: number, fraction: number): number {
	return Math.ceil(totalMembers * fraction);
}

export function hasQuorum(presentCount: number, totalMembers: number, fraction: number): boolean {
	return presentCount >= quorumThreshold(totalMembers, fraction);
}
