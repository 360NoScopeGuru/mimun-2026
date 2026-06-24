import { describe, it, expect } from 'vitest';
import {
	tallyBallots,
	majorityBase,
	requiredToPass,
	decide,
	quorumThreshold,
	hasQuorum,
	type BallotChoice
} from './voting';

describe('tallyBallots', () => {
	it('counts each choice', () => {
		const choices: BallotChoice[] = ['for', 'for', 'against', 'abstain', 'pass'];
		expect(tallyBallots(choices)).toEqual({ for: 2, against: 1, abstain: 1, pass: 1 });
	});
	it('handles an empty ballot box', () => {
		expect(tallyBallots([])).toEqual({ for: 0, against: 0, abstain: 0, pass: 0 });
	});
});

describe('majorityBase', () => {
	it('excludes abstentions and passes', () => {
		expect(majorityBase({ for: 5, against: 3, abstain: 4, pass: 2 })).toBe(8);
	});
});

describe('requiredToPass', () => {
	it('simple majority is more than half', () => {
		expect(requiredToPass(10, 'simple')).toBe(6);
		expect(requiredToPass(3, 'simple')).toBe(2);
		expect(requiredToPass(1, 'simple')).toBe(1);
	});
	it('two-thirds rounds up', () => {
		expect(requiredToPass(9, 'two_thirds')).toBe(6);
		expect(requiredToPass(10, 'two_thirds')).toBe(7);
		expect(requiredToPass(3, 'two_thirds')).toBe(2);
	});
});

describe('decide', () => {
	it('passes on a clear simple majority', () => {
		expect(decide({ for: 6, against: 4, abstain: 0, pass: 0 }, 'simple')).toBe('passed');
	});
	it('fails on a tie', () => {
		expect(decide({ for: 5, against: 5, abstain: 0, pass: 0 }, 'simple')).toBe('failed');
	});
	it('ignores abstentions when forming the base', () => {
		// base = 3 (2 for, 1 against) → need 2; abstentions do not raise the bar
		expect(decide({ for: 2, against: 1, abstain: 9, pass: 0 }, 'simple')).toBe('passed');
	});
	it('applies two-thirds correctly', () => {
		expect(decide({ for: 6, against: 3, abstain: 0, pass: 0 }, 'two_thirds')).toBe('passed');
		expect(decide({ for: 5, against: 4, abstain: 0, pass: 0 }, 'two_thirds')).toBe('failed');
	});
	it('an empty vote fails', () => {
		expect(decide({ for: 0, against: 0, abstain: 0, pass: 0 }, 'simple')).toBe('failed');
	});
});

describe('quorum', () => {
	it('threshold rounds up to a whole delegate', () => {
		expect(quorumThreshold(20, 1 / 4)).toBe(5);
		expect(quorumThreshold(21, 1 / 4)).toBe(6); // 5.25 → 6
	});
	it('hasQuorum compares present against the threshold', () => {
		expect(hasQuorum(5, 20, 1 / 4)).toBe(true);
		expect(hasQuorum(4, 20, 1 / 4)).toBe(false);
	});
});
