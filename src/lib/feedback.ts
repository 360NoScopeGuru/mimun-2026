/**
 * Shared shape for AI document feedback (resolutions + position papers).
 * Lives outside `$lib/server` so client components can import the type without
 * pulling server-only code into the browser bundle.
 */
export type Feedback = {
	overall: string;
	scores: { clarity: number; diplomacy: number; feasibility: number; formatting: number };
	strengths: string[];
	improvements: { area: string; note: string }[];
};

export const SCORE_LABELS: { key: keyof Feedback['scores']; label: string }[] = [
	{ key: 'clarity', label: 'Clarity' },
	{ key: 'diplomacy', label: 'Diplomacy' },
	{ key: 'feasibility', label: 'Feasibility' },
	{ key: 'formatting', label: 'Formatting' }
];
