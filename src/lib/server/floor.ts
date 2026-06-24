import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { committeeFloor, committees, resolutions, votes, type committees as committeesTable } from './db/schema';
import { presetFor, motionDef, substantiveMajority } from './procedure';

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

export async function startCaucus(committee: Committee, type: 'moderated_caucus' | 'unmoderated_caucus', totalSeconds: number, topic?: string) {
	await db
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
	method: 'placard' | 'roll_call' = 'roll_call'
) {
	const preset = presetOf(committee);
	await db.update(votes).set({ status: 'closed', closesAt: new Date() }).where(and(eq(votes.committeeId, committee.id), eq(votes.status, 'open')));
	const [v] = await db
		.insert(votes)
		.values({ committeeId: committee.id, subjectType: subject, subjectId, label, kind: 'substantive', majorityRule: substantiveMajority(preset, subject), method, status: 'open' })
		.returning();
	await db.update(committeeFloor).set({ mode: 'voting', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
	return v;
}

/** Carry out a motion that has passed (or been adopted by consent). */
export async function executeMotion(committee: Committee, motion: { type: string; params: unknown }) {
	const def = motionDef(motion.type);
	const p = (motion.params ?? {}) as MotionParams;
	const preset = presetOf(committee);

	switch (def?.execution) {
		case 'start_moderated_caucus':
			await startCaucus(committee, 'moderated_caucus', p.totalSeconds ?? preset.defaults.moderatedTotalSeconds, p.topic);
			break;
		case 'start_unmoderated_caucus':
			await startCaucus(committee, 'unmoderated_caucus', p.totalSeconds ?? preset.defaults.unmoderatedTotalSeconds, p.topic);
			break;
		case 'extend_caucus': {
			const [floor] = await db.select().from(committeeFloor).where(eq(committeeFloor.committeeId, committee.id));
			const base = floor?.caucusTimerEndsAt ? new Date(floor.caucusTimerEndsAt).getTime() : Date.now();
			await db
				.update(committeeFloor)
				.set({ caucusTimerEndsAt: new Date(base + (p.extendSeconds ?? 120) * 1000), updatedAt: new Date() })
				.where(eq(committeeFloor.committeeId, committee.id));
			break;
		}
		case 'introduce_resolution':
			if (p.targetResolutionId) {
				await db.update(committeeFloor).set({ activeResolutionId: p.targetResolutionId, mode: 'formal_debate', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
				await db.update(resolutions).set({ status: 'on_floor', introducedAt: new Date() }).where(eq(resolutions.id, p.targetResolutionId));
			}
			break;
		case 'open_substantive_vote': {
			const [floor] = await db.select().from(committeeFloor).where(eq(committeeFloor.committeeId, committee.id));
			if (floor?.activeResolutionId) {
				await openSubstantiveVote(committee, 'resolution', floor.activeResolutionId, 'Adoption of the resolution', 'roll_call');
			}
			break;
		}
		case 'adjourn':
			await db.update(committees).set({ status: 'closed' }).where(eq(committees.id, committee.id));
			await db.update(committeeFloor).set({ mode: 'closed', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
			break;
		case 'suspend':
			await db.update(committees).set({ status: 'suspended' }).where(eq(committees.id, committee.id));
			break;
	}
}
