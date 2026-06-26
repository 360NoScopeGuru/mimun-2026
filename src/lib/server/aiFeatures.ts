/**
 * Domain AI features, composed on top of the provider-agnostic client in `ai.ts`.
 *
 * Prompt builders are pure (and unit-tested): routes assemble the domain inputs
 * (procedure preset, clauses, session stats) from the DB and pass them in, the
 * same way `committeeState.ts` owns queries and `procedure/` stays pure.
 */
import { aiComplete, aiJson, type CompleteOptions } from './ai';
import type { ProcedurePreset } from './procedure';
import type { Feedback } from '../feedback';

export type { Feedback };

const PCT = (frac: number) => `${Math.round(frac * 100)}%`;
const MAJORITY = (r: 'simple' | 'two_thirds') =>
	r === 'two_thirds' ? 'a two-thirds majority' : 'a simple majority';

/** A compact, human-readable description of a procedure preset for grounding. */
export function describePreset(preset: ProcedurePreset): string {
	const d = preset.defaults;
	return [
		`Rules of procedure: ${preset.name}.`,
		`Quorum: at least ${PCT(preset.quorumFraction)} of committee members must be present to conduct business.`,
		`Procedural motions pass by ${MAJORITY(preset.majorities.procedural)} of those present and voting.`,
		`Resolutions pass by ${MAJORITY(preset.majorities.resolution)} of those present and voting.`,
		`Amendments pass by ${MAJORITY(preset.majorities.amendment)} of those present and voting.`,
		`Default speaking time is ${d.speakingSeconds}s; a moderated caucus runs ${d.moderatedTotalSeconds}s total with ${d.moderatedSpeakingSeconds}s per speaker; an unmoderated caucus runs ${d.unmoderatedTotalSeconds}s.`
	].join(' ');
}

/* ------------------------------------------------------------------ *
 * 1. AI Parliamentarian — procedure Q&A
 * ------------------------------------------------------------------ */

export function parliamentarianPrompt(args: {
	preset: ProcedurePreset;
	committeeName: string;
	modeLabel: string;
	question: string;
}): CompleteOptions {
	const system = [
		'You are an expert Model UN parliamentarian and chair advisor. You answer delegates’ and dais questions about rules of procedure clearly, accurately, and concisely.',
		'Ground every answer in the rules below. When a number applies (quorum, majority, speaking time), state it. If something depends on the chair’s discretion, say so. If a question is outside parliamentary procedure, briefly redirect.',
		'Answer in at most 120 words. Use plain language a first-time delegate understands. Do not invent rules that are not provided.',
		'',
		`Committee: ${args.committeeName}. Current state of the floor: ${args.modeLabel}.`,
		describePreset(args.preset)
	].join('\n');
	return { system, prompt: args.question, temperature: 0.3, maxTokens: 350 };
}

export async function askParliamentarian(args: {
	preset: ProcedurePreset;
	committeeName: string;
	modeLabel: string;
	question: string;
}) {
	return aiComplete(parliamentarianPrompt(args));
}

/* ------------------------------------------------------------------ *
 * 2. Resolution / position-paper feedback (structured)
 * ------------------------------------------------------------------ */

const FEEDBACK_CONTRACT = [
	'Return ONLY a JSON object with this exact shape:',
	'{',
	'  "overall": string,                       // one or two sentence verdict',
	'  "scores": { "clarity": number, "diplomacy": number, "feasibility": number, "formatting": number }, // each 1-5 integers',
	'  "strengths": string[],                    // 2-4 concrete strengths',
	'  "improvements": [ { "area": string, "note": string } ]  // 2-5 specific, actionable items',
	'}',
	'No prose outside the JSON.'
].join('\n');

export function resolutionFeedbackPrompt(args: {
	committeeName: string;
	agendaIssue: string;
	title: string;
	preambulatory: string[];
	operative: string[];
}): CompleteOptions {
	const doc = [
		`Title: ${args.title || '(untitled)'}`,
		`Agenda issue: ${args.agendaIssue || '(unspecified)'}`,
		'',
		'Preambulatory clauses:',
		...(args.preambulatory.length ? args.preambulatory.map((c, i) => `  ${i + 1}. ${c}`) : ['  (none)']),
		'',
		'Operative clauses:',
		...(args.operative.length ? args.operative.map((c, i) => `  ${i + 1}. ${c}`) : ['  (none)'])
	].join('\n');
	const system = [
		`You are a seasoned THIMUN-style Model UN chair reviewing a draft resolution for the committee "${args.committeeName}".`,
		'Judge it on: clarity, diplomatic tone, feasibility/implementation, and THIMUN formatting (preambulatory clauses begin with participles and end in commas; operative clauses are numbered, begin with active verbs, and end in semicolons; the document is a single sentence).',
		'Be specific and reference clauses by number. Be encouraging but honest.',
		'',
		FEEDBACK_CONTRACT
	].join('\n');
	return { system, prompt: doc, temperature: 0.3, maxTokens: 900 };
}

export async function reviewResolution(args: Parameters<typeof resolutionFeedbackPrompt>[0]) {
	return aiJson<Feedback>(resolutionFeedbackPrompt(args));
}

export function positionPaperFeedbackPrompt(args: {
	committeeName: string;
	country: string;
	topic: string;
	text: string;
}): CompleteOptions {
	const system = [
		`You are a THIMUN-style Model UN chair reviewing a delegate's position paper for the committee "${args.committeeName}".`,
		`The delegate represents ${args.country || 'their country'} on the topic "${args.topic || 'the agenda'}".`,
		'Judge it on: clarity, diplomatic tone and accurate representation of the country’s real foreign policy, feasibility of proposed solutions, and structure/formatting (background, country position, proposed solutions).',
		'Be specific and constructive. Flag any stance that contradicts the country’s actual policy.',
		'',
		FEEDBACK_CONTRACT
	].join('\n');
	// Cap the paper length we send to keep token use and latency bounded.
	const text = args.text.slice(0, 8000);
	return { system, prompt: text, temperature: 0.3, maxTokens: 900 };
}

export async function reviewPositionPaper(args: Parameters<typeof positionPaperFeedbackPrompt>[0]) {
	return aiJson<Feedback>(positionPaperFeedbackPrompt(args));
}

/* ------------------------------------------------------------------ *
 * 3. Session summary (chair)
 * ------------------------------------------------------------------ */

export type SessionStats = {
	committeeName: string;
	topic: string;
	present: number;
	total: number;
	messages: number;
	speeches: number;
	motions: { label: string; status: string }[];
	votes: { label: string; result: string; tally: string }[];
	adoptedResolutions: string[];
};

export function sessionSummaryPrompt(stats: SessionStats): CompleteOptions {
	const lines = [
		`Committee: ${stats.committeeName}`,
		`Topic: ${stats.topic || '(unspecified)'}`,
		`Attendance: ${stats.present}/${stats.total} present`,
		`Speeches delivered: ${stats.speeches}`,
		`Floor messages: ${stats.messages}`,
		'',
		'Motions:',
		...(stats.motions.length ? stats.motions.map((m) => `  - ${m.label} — ${m.status}`) : ['  (none)']),
		'',
		'Votes:',
		...(stats.votes.length
			? stats.votes.map((v) => `  - ${v.label}: ${v.result} (${v.tally})`)
			: ['  (none)']),
		'',
		'Resolutions adopted:',
		...(stats.adoptedResolutions.length
			? stats.adoptedResolutions.map((r) => `  - ${r}`)
			: ['  (none)'])
	].join('\n');
	const system = [
		'You are the rapporteur for a Model UN committee. Write a concise, professional session summary suitable for the conference record and for sharing with delegates.',
		'Structure: a one-paragraph overview, then short bullet lists for "Key decisions" and "Where debate stands / next steps". Keep it under 220 words. Use only the facts provided; do not invent outcomes.'
	].join('\n');
	return { system, prompt: lines, temperature: 0.4, maxTokens: 700 };
}

export async function summarizeSession(stats: SessionStats) {
	return aiComplete(sessionSummaryPrompt(stats));
}

/* ------------------------------------------------------------------ *
 * 4. Award recommendations (chair) — grounded ONLY in measured activity
 * ------------------------------------------------------------------ */

export type AwardRecommendation = { award: string; delegate: string; reason: string };
export type AwardRecommendations = { awards: AwardRecommendation[] };

const AWARD_CONTRACT = [
	'Return ONLY a JSON object with this exact shape:',
	'{ "awards": [ { "award": string, "delegate": string, "reason": string } ] }',
	'Use the exact delegation labels provided. No prose outside the JSON.'
].join('\n');

export function awardRecommendationPrompt(args: {
	committeeName: string;
	topic: string;
	delegates: { label: string; score: number; speeches: number; motions: number; amendments: number; points: number; messages: number; votes: number }[];
}): CompleteOptions {
	const table = args.delegates
		.slice(0, 40)
		.map(
			(d) =>
				`${d.label} — score ${d.score}; speeches ${d.speeches}, motions ${d.motions}, amendments ${d.amendments}, points ${d.points}, messages ${d.messages}, votes ${d.votes}`
		)
		.join('\n');
	const system = [
		`You are the dais of the Model UN committee "${args.committeeName}" (topic: "${args.topic || 'the agenda'}") deciding session awards.`,
		'You are given each delegation’s MEASURED activity. Recommend awards using ONLY these metrics — do not invent speeches, quotes, alliances, or facts the numbers do not support. Justify each award with the specific metrics that earned it.',
		'Fill these only where the data supports a defensible choice: "Best Delegate", "Outstanding Delegate", "Honourable Mention". Prefer fewer, well-justified awards over forced ones. Do not award on dimensions you were not given (e.g. position-paper quality).',
		'',
		AWARD_CONTRACT
	].join('\n');
	return { system, prompt: table, temperature: 0.2, maxTokens: 700 };
}

export async function recommendAwards(args: Parameters<typeof awardRecommendationPrompt>[0]) {
	return aiJson<AwardRecommendations>(awardRecommendationPrompt(args));
}

/* ------------------------------------------------------------------ *
 * 5. Resolution overlap — duplicate / conflict detection across drafts
 * ------------------------------------------------------------------ */

export type ResolutionOverlap = {
	verdict: string;
	duplicates: { resolution: string; reason: string }[];
	conflicts: { resolution: string; reason: string }[];
};

export function resolutionConflictPrompt(args: {
	committeeName: string;
	draft: { title: string; clauses: string[] };
	others: { title: string; clauses: string[] }[];
}): CompleteOptions {
	const draftDoc = [`DRAFT — ${args.draft.title || '(untitled)'}`, ...args.draft.clauses.map((c, i) => `  ${i + 1}. ${c}`)].join('\n');
	const othersDoc = args.others
		.map((r, i) => [`RESOLUTION ${i + 1} — ${r.title || '(untitled)'}`, ...r.clauses.slice(0, 12).map((c, j) => `  ${j + 1}. ${c}`)].join('\n'))
		.join('\n\n');
	const system = [
		`You compare a draft resolution against the other resolutions on the floor of the Model UN committee "${args.committeeName}".`,
		'Identify (a) DUPLICATES — resolutions that substantially overlap the draft in substance, and (b) CONFLICTS — resolutions whose operative provisions would contradict or undercut the draft if both passed.',
		'Reference resolutions by title and be specific about which provisions overlap or clash. If there is no meaningful overlap or conflict, return empty arrays and say so in the verdict.',
		'',
		'Return ONLY a JSON object: { "verdict": string, "duplicates": [ { "resolution": string, "reason": string } ], "conflicts": [ { "resolution": string, "reason": string } ] }. No prose outside the JSON.'
	].join('\n');
	return { system, prompt: `${draftDoc}\n\n--- OTHER RESOLUTIONS ---\n\n${othersDoc}`, temperature: 0.2, maxTokens: 800 };
}

export async function detectResolutionOverlap(args: Parameters<typeof resolutionConflictPrompt>[0]) {
	return aiJson<ResolutionOverlap>(resolutionConflictPrompt(args));
}
