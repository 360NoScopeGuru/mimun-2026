import { and, eq } from 'drizzle-orm';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { db } from './db';
import { committeeFloor, committees, resolutions, resolutionClauses, amendments, votes, type committees as committeesTable } from './db/schema';
import { presetFor, motionDef, substantiveMajority } from './procedure';

// A database handle *or* a transaction handle. Multi-step floor mutations accept
// this so a caller (e.g. closeVote) can pass its transaction and keep the whole
// outcome atomic; callers that don't care default to the shared `db`.
type Executor = PgDatabase<any, any, any>;

type Committee = typeof committeesTable.$inferSelect;
type MotionParams = {
	totalSeconds?: number;
	speakingSeconds?: number;
	topic?: string;
	targetResolutionId?: string;
	extendSeconds?: number;
};

const secondsFromNow = (s: number) => new Date(Date.now() + s * 1000);
const presetOf = (c: Committee) => presetFor((c.rulesConfig as { preset?: string })?.preset);

export async function startCaucus(
	committee: Committee,
	type: 'moderated_caucus' | 'unmoderated_caucus',
	totalSeconds: number,
	topic?: string,
	dbx: Executor = db
) {
	await dbx
		.update(committeeFloor)
		.set({ mode: type, caucusTimerEndsAt: secondsFromNow(totalSeconds), caucusTopic: topic || null, currentSpeakerId: null, speakerTimerEndsAt: null, updatedAt: new Date() })
		.where(eq(committeeFloor.committeeId, committee.id));
}

/** Open a substantive vote (resolution/amendment); closes any other open vote first. */
export async function openSubstantiveVote(
	committee: Committee,
	subject: 'resolution' | 'amendment',
	subjectId: string,
	label: string,
	method: 'placard' | 'roll_call' = 'roll_call',
	dbx: Executor = db
) {
	const preset = presetOf(committee);
	await dbx.update(votes).set({ status: 'closed', closesAt: new Date() }).where(and(eq(votes.committeeId, committee.id), eq(votes.status, 'open')));
	const [v] = await dbx
		.insert(votes)
		.values({ committeeId: committee.id, subjectType: subject, subjectId, label, kind: 'substantive', majorityRule: substantiveMajority(preset, subject), method, status: 'open' })
		.returning();
	await dbx.update(committeeFloor).set({ mode: 'voting', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
	return v;
}

type Amendment = typeof amendments.$inferSelect;

/** Apply an amendment to its resolution's clauses (strike / amend / add). */
export async function applyAmendment(a: Amendment, dbx: Executor = db) {
	if (a.action === 'strike' && a.targetClauseId) {
		await dbx.delete(resolutionClauses).where(eq(resolutionClauses.id, a.targetClauseId));
	} else if (a.action === 'amend' && a.targetClauseId) {
		await dbx.update(resolutionClauses).set({ text: a.text }).where(eq(resolutionClauses.id, a.targetClauseId));
	} else if (a.action === 'add') {
		const existing = await dbx
			.select({ position: resolutionClauses.position })
			.from(resolutionClauses)
			.where(and(eq(resolutionClauses.resolutionId, a.resolutionId), eq(resolutionClauses.kind, 'operative')));
		await dbx.insert(resolutionClauses).values({ resolutionId: a.resolutionId, kind: 'operative', position: existing.length, text: a.text });
	}
}

/** Carry out a motion that has passed (or been adopted by consent). */
export async function executeMotion(committee: Committee, motion: { type: string; params: unknown }, dbx: Executor = db) {
	const def = motionDef(motion.type);
	const p = (motion.params ?? {}) as MotionParams;
	const preset = presetOf(committee);

	switch (def?.execution) {
		case 'start_moderated_caucus':
			await startCaucus(committee, 'moderated_caucus', p.totalSeconds ?? preset.defaults.moderatedTotalSeconds, p.topic, dbx);
			break;
		case 'start_unmoderated_caucus':
			await startCaucus(committee, 'unmoderated_caucus', p.totalSeconds ?? preset.defaults.unmoderatedTotalSeconds, p.topic, dbx);
			break;
		case 'extend_caucus': {
			const [floor] = await dbx.select().from(committeeFloor).where(eq(committeeFloor.committeeId, committee.id));
			const base = floor?.caucusTimerEndsAt ? new Date(floor.caucusTimerEndsAt).getTime() : Date.now();
			await dbx
				.update(committeeFloor)
				.set({ caucusTimerEndsAt: new Date(base + (p.extendSeconds ?? 120) * 1000), updatedAt: new Date() })
				.where(eq(committeeFloor.committeeId, committee.id));
			break;
		}
		case 'introduce_resolution':
			if (p.targetResolutionId) {
				await dbx.update(committeeFloor).set({ activeResolutionId: p.targetResolutionId, mode: 'formal_debate', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
				await dbx.update(resolutions).set({ status: 'on_floor', introducedAt: new Date() }).where(eq(resolutions.id, p.targetResolutionId));
			}
			break;
		case 'open_substantive_vote': {
			const [floor] = await dbx.select().from(committeeFloor).where(eq(committeeFloor.committeeId, committee.id));
			if (floor?.activeResolutionId) {
				await openSubstantiveVote(committee, 'resolution', floor.activeResolutionId, 'Adoption of the resolution', 'roll_call', dbx);
			}
			break;
		}
		case 'adjourn':
			await dbx.update(committees).set({ status: 'closed' }).where(eq(committees.id, committee.id));
			await dbx.update(committeeFloor).set({ mode: 'closed', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
			break;
		case 'suspend':
			await dbx.update(committees).set({ status: 'suspended' }).where(eq(committees.id, committee.id));
			break;
	}
}
