import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { delegates, messages, speakerQueue, motions, amendments, points, votes, ballots, resolutions } from './db/schema';

export type ParticipationRow = {
	delegateId: string;
	name: string;
	country: string;
	speeches: number;
	messages: number;
	motions: number;
	amendments: number;
	points: number;
	votes: number;
	score: number;
};

/**
 * Weighted-sum ranking used as the default sort. Speeches and authored
 * documents (motions/amendments) count for the most; chatter (messages) and
 * casting ballots count for the least. Tweak the weights here, not the page.
 */
function weightedScore(r: Omit<ParticipationRow, 'score' | 'delegateId' | 'name' | 'country'>): number {
	return Math.round(r.speeches * 3 + r.motions * 2 + r.amendments * 2 + r.points * 1 + r.messages * 0.5 + r.votes * 0.5);
}

/**
 * Per-delegation activity tally for a committee, used by the dais to weigh
 * awards. Returns one row per ACTIVE country delegate (role 'delegate'); staff
 * and the dais are excluded. Each metric is a single grouped count assembled in
 * JS via Maps to avoid an N+1 fan-out across delegates.
 */
export async function getParticipation(committeeId: string): Promise<ParticipationRow[]> {
	// The roster the awards are drawn from: active country delegates only.
	const roster = await db
		.select({ id: delegates.id, name: delegates.fullName, country: delegates.country })
		.from(delegates)
		.where(and(eq(delegates.committeeId, committeeId), eq(delegates.role, 'delegate'), eq(delegates.active, 1)));

	if (roster.length === 0) return [];

	const ids = roster.map((r) => r.id);
	const count = sql<number>`count(*)`.mapWith(Number);
	const distinctVotes = sql<number>`count(distinct ${ballots.voteId})`.mapWith(Number);

	const [speechRows, messageRows, motionRows, amendmentRows, pointRows, voteRows] = await Promise.all([
		// speeches: queue entries that reached the floor (spoke or finished speaking).
		db
			.select({ id: speakerQueue.delegateId, c: count })
			.from(speakerQueue)
			.where(and(eq(speakerQueue.committeeId, committeeId), inArray(speakerQueue.delegateId, ids), inArray(speakerQueue.status, ['speaking', 'done'])))
			.groupBy(speakerQueue.delegateId),
		db
			.select({ id: messages.delegateId, c: count })
			.from(messages)
			.where(and(eq(messages.committeeId, committeeId), inArray(messages.delegateId, ids)))
			.groupBy(messages.delegateId),
		db
			.select({ id: motions.proposedById, c: count })
			.from(motions)
			.where(and(eq(motions.committeeId, committeeId), inArray(motions.proposedById, ids)))
			.groupBy(motions.proposedById),
		// amendments carry no committeeId — scope them via their parent resolution.
		db
			.select({ id: amendments.proposedById, c: count })
			.from(amendments)
			.innerJoin(resolutions, eq(amendments.resolutionId, resolutions.id))
			.where(and(eq(resolutions.committeeId, committeeId), inArray(amendments.proposedById, ids)))
			.groupBy(amendments.proposedById),
		db
			.select({ id: points.byId, c: count })
			.from(points)
			.where(and(eq(points.committeeId, committeeId), inArray(points.byId, ids)))
			.groupBy(points.byId),
		// votes: distinct votes a delegate cast any ballot in, scoped via the vote's committee.
		db
			.select({ id: ballots.delegateId, c: distinctVotes })
			.from(ballots)
			.innerJoin(votes, eq(ballots.voteId, votes.id))
			.where(and(eq(votes.committeeId, committeeId), inArray(ballots.delegateId, ids)))
			.groupBy(ballots.delegateId)
	]);

	const toMap = (rows: { id: string; c: number }[]) => new Map(rows.map((r) => [r.id, r.c]));
	const speechBy = toMap(speechRows);
	const messageBy = toMap(messageRows);
	const motionBy = toMap(motionRows);
	const amendmentBy = toMap(amendmentRows);
	const pointBy = toMap(pointRows);
	const voteBy = toMap(voteRows);

	return roster.map((d) => {
		const metrics = {
			speeches: speechBy.get(d.id) ?? 0,
			messages: messageBy.get(d.id) ?? 0,
			motions: motionBy.get(d.id) ?? 0,
			amendments: amendmentBy.get(d.id) ?? 0,
			points: pointBy.get(d.id) ?? 0,
			votes: voteBy.get(d.id) ?? 0
		};
		return {
			delegateId: d.id,
			name: d.name,
			country: d.country,
			...metrics,
			score: weightedScore(metrics)
		};
	});
}
