import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import {
	committees,
	delegates,
	messages,
	speakerQueue,
	motions,
	votes,
	resolutions,
	attendance
} from './db/schema';
import type { SessionStats } from './aiFeatures';

type Committee = typeof committees.$inferSelect;

const humanize = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * Committee-level activity snapshot for the AI session summary. One grouped
 * query per metric (no per-delegate fan-out), mirroring `participation.ts`.
 */
export async function getSessionStats(committee: Committee): Promise<SessionStats> {
	const committeeId = committee.id;
	const count = sql<number>`count(*)`.mapWith(Number);

	const [roster, attendanceRows, msgRows, speechRows, motionRows, voteRows, adoptedRows] =
		await Promise.all([
			db
				.select({ role: delegates.role })
				.from(delegates)
				.where(and(eq(delegates.committeeId, committeeId), eq(delegates.active, 1))),
			db
				.select({ status: attendance.status, role: delegates.role })
				.from(attendance)
				.innerJoin(delegates, eq(attendance.delegateId, delegates.id))
				.where(eq(attendance.committeeId, committeeId)),
			db.select({ c: count }).from(messages).where(eq(messages.committeeId, committeeId)),
			db
				.select({ c: count })
				.from(speakerQueue)
				.where(
					and(
						eq(speakerQueue.committeeId, committeeId),
						inArray(speakerQueue.status, ['speaking', 'done'])
					)
				),
			db
				.select({ type: motions.type, status: motions.status })
				.from(motions)
				.where(eq(motions.committeeId, committeeId))
				.orderBy(asc(motions.createdAt)),
			db
				.select({
					label: votes.label,
					result: votes.result,
					f: votes.tallyFor,
					a: votes.tallyAgainst,
					ab: votes.tallyAbstain
				})
				.from(votes)
				.where(eq(votes.committeeId, committeeId))
				.orderBy(asc(votes.opensAt)),
			db
				.select({ designation: resolutions.designation, title: resolutions.title })
				.from(resolutions)
				.where(and(eq(resolutions.committeeId, committeeId), eq(resolutions.status, 'adopted')))
		]);

	const total = roster.filter((r) => r.role === 'delegate').length;
	const present = attendanceRows.filter((a) => a.role === 'delegate' && a.status !== 'absent').length;

	return {
		committeeName: committee.name,
		topic: committee.topic,
		present,
		total,
		messages: msgRows[0]?.c ?? 0,
		speeches: speechRows[0]?.c ?? 0,
		motions: motionRows.map((m) => ({ label: humanize(m.type), status: m.status })),
		votes: voteRows
			.filter((v) => v.result)
			.map((v) => ({
				label: v.label || 'Vote',
				result: humanize(v.result as string),
				tally: `${v.f}–${v.a}–${v.ab}`
			})),
		adoptedResolutions: adoptedRows.map((r) =>
			[r.designation, r.title].filter(Boolean).join(' · ')
		)
	};
}
