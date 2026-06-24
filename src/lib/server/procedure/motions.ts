import type { ProcedurePreset, MajorityRule } from './config';
import type { BallotChoice } from './voting';

/** What happens when a motion carries (or is adopted by consent). */
export type MotionExecution =
	| 'start_moderated_caucus'
	| 'start_unmoderated_caucus'
	| 'extend_caucus'
	| 'introduce_resolution'
	| 'open_substantive_vote'
	| 'adjourn'
	| 'suspend';

export type MotionDef = {
	type: string;
	label: string;
	/** Higher precedence is entertained first. */
	precedence: number;
	/** Whether it requires a committee vote (vs. chair discretion). */
	needsVote: boolean;
	execution: MotionExecution;
};

// THIMUN-leaning defaults — configurable per committee later.
export const MOTION_DEFS: Record<string, MotionDef> = {
	adjourn_debate: { type: 'adjourn_debate', label: 'Adjourn debate', precedence: 100, needsVote: true, execution: 'adjourn' },
	suspend_session: { type: 'suspend_session', label: 'Suspend the session', precedence: 90, needsVote: true, execution: 'suspend' },
	move_to_voting: { type: 'move_to_voting', label: 'Move to voting procedure', precedence: 80, needsVote: true, execution: 'open_substantive_vote' },
	close_debate: { type: 'close_debate', label: 'Close debate', precedence: 75, needsVote: true, execution: 'open_substantive_vote' },
	introduce_resolution: { type: 'introduce_resolution', label: 'Introduce a draft resolution', precedence: 60, needsVote: true, execution: 'introduce_resolution' },
	unmoderated_caucus: { type: 'unmoderated_caucus', label: 'Unmoderated caucus', precedence: 50, needsVote: true, execution: 'start_unmoderated_caucus' },
	moderated_caucus: { type: 'moderated_caucus', label: 'Moderated caucus', precedence: 40, needsVote: true, execution: 'start_moderated_caucus' },
	extend_debate: { type: 'extend_debate', label: 'Extend debate time', precedence: 30, needsVote: true, execution: 'extend_caucus' }
};

export function motionDef(type: string): MotionDef | undefined {
	return MOTION_DEFS[type];
}

export function motionPrecedence(type: string): number {
	return MOTION_DEFS[type]?.precedence ?? 0;
}

/** Sort pending motions by precedence (desc), breaking ties oldest-first (FIFO). */
export function sortByPrecedence<T extends { type: string; createdAt: string | Date }>(motions: T[]): T[] {
	return [...motions].sort((a, b) => {
		const byPrec = motionPrecedence(b.type) - motionPrecedence(a.type);
		if (byPrec !== 0) return byPrec;
		return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
	});
}

/** Majority required for a substantive vote on a resolution or amendment. */
export function substantiveMajority(preset: ProcedurePreset, subject: 'resolution' | 'amendment'): MajorityRule {
	return subject === 'amendment' ? preset.majorities.amendment : preset.majorities.resolution;
}

/** In roll-call voting, any delegation that "passed" must vote in a second round. */
export function needsSecondRound(roundChoices: BallotChoice[]): boolean {
	return roundChoices.includes('pass');
}
