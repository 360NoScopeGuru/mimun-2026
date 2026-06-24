/**
 * Procedure presets. The engine is configurable so different conferences /
 * committees can run different rules; THIMUN is the default for MIMUN 2026.
 */

export type MajorityRule = 'simple' | 'two_thirds';

export type ProcedurePreset = {
	name: string;
	/** Fraction of committee members that must be present to conduct business. */
	quorumFraction: number;
	/** Default timings (seconds) for the floor. */
	defaults: {
		speakingSeconds: number;
		moderatedTotalSeconds: number;
		moderatedSpeakingSeconds: number;
		unmoderatedTotalSeconds: number;
	};
	/** Majority required for each kind of vote. */
	majorities: {
		procedural: MajorityRule;
		resolution: MajorityRule;
		amendment: MajorityRule;
	};
};

export const THIMUN: ProcedurePreset = {
	name: 'THIMUN',
	quorumFraction: 1 / 4,
	defaults: {
		speakingSeconds: 90,
		moderatedTotalSeconds: 600,
		moderatedSpeakingSeconds: 60,
		unmoderatedTotalSeconds: 600
	},
	// THIMUN substantive votes pass by simple majority of those present and voting.
	majorities: { procedural: 'simple', resolution: 'simple', amendment: 'simple' }
};

export const PRESETS: Record<string, ProcedurePreset> = { THIMUN };

export function presetFor(name: string | undefined): ProcedurePreset {
	return (name && PRESETS[name]) || THIMUN;
}
