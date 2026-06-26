import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { delegates, messages, speakerQueue, motions, notes, votes, ballots } from './db/schema';
import { clusterBlocs, bucketTimeline, type Choice, type VoteVector } from './analytics-core';

// Unique data MIMUN already captures becomes a committee's diplomacy dossier:
// who votes together, when the floor was alive, and who negotiated with whom.
// All read-only over existing tables — no new schema, no external dependency.

type Label = { id: string; label: string };

async function rosterLabels(committeeId: string): Promise<Map<string, string>> {
	const roster = await db
		.select({ id: delegates.id, name: delegates.fullName, country: delegates.country })
		.from(delegates)
		.where(and(eq(delegates.committeeId, committeeId), eq(delegates.active, 1)));
	return new Map(roster.map((r) => [r.id, r.country || r.name]));
}

export type BlocAnalysis = {
	votes: number;
	delegates: Label[];
	matrix: number[][];
	blocs: { members: string[] }[];
};

/** Cluster delegations by how alike they voted, with an alignment heatmap. */
export async function getVotingBlocs(committeeId: string): Promise<BlocAnalysis> {
	const rows = await db
		.select({ delegateId: ballots.delegateId, voteId: ballots.voteId, choice: ballots.choice, round: ballots.round, voteAt: votes.opensAt })
		.from(ballots)
		.innerJoin(votes, eq(ballots.voteId, votes.id))
		.where(eq(votes.committeeId, committeeId));

	const label = await rosterLabels(committeeId);
	if (rows.length === 0) return { votes: 0, delegates: [], matrix: [], blocs: [] };

	// Votes in chronological order define the vector dimensions.
	const voteAt = new Map<string, number>();
	for (const r of rows) voteAt.set(r.voteId, new Date(r.voteAt).getTime());
	const voteOrder = [...voteAt.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
	const voteIndex = new Map(voteOrder.map((id, i) => [id, i] as const));

	// Latest-round choice per (delegate, vote).
	const vec = new Map<string, (Choice | null)[]>();
	const bestRound = new Map<string, number[]>();
	const ensure = (id: string) => {
		if (!vec.has(id)) {
			vec.set(id, new Array(voteOrder.length).fill(null));
			bestRound.set(id, new Array(voteOrder.length).fill(-1));
		}
	};
	for (const r of rows) {
		if (!label.has(r.delegateId)) continue; // active country delegates only
		ensure(r.delegateId);
		const i = voteIndex.get(r.voteId)!;
		const rounds = bestRound.get(r.delegateId)!;
		if (r.round > rounds[i]) {
			rounds[i] = r.round;
			vec.get(r.delegateId)![i] = r.choice as Choice;
		}
	}

	const vectors: VoteVector[] = [...vec.entries()].map(([delegateId, choices]) => ({ delegateId, choices }));
	const { blocs, matrix, order } = clusterBlocs(vectors);

	return {
		votes: voteOrder.length,
		delegates: order.map((id) => ({ id, label: label.get(id) ?? id })),
		matrix,
		blocs: blocs.map((members) => ({ members: members.map((id) => label.get(id) ?? id) }))
	};
}

export type EngagementAnalysis = {
	timeline: { t: number; count: number }[];
	totals: { messages: number; speeches: number; motions: number; ballots: number };
};

/** When the floor was alive — a single engagement sparkline + per-kind totals. */
export async function getEngagementTimeline(committeeId: string): Promise<EngagementAnalysis> {
	const [msgs, speeches, mots, balls] = await Promise.all([
		db.select({ at: messages.createdAt }).from(messages).where(eq(messages.committeeId, committeeId)),
		db
			.select({ at: speakerQueue.joinedAt })
			.from(speakerQueue)
			.where(and(eq(speakerQueue.committeeId, committeeId), inArray(speakerQueue.status, ['speaking', 'done']))),
		db.select({ at: motions.createdAt }).from(motions).where(eq(motions.committeeId, committeeId)),
		db
			.select({ at: ballots.createdAt })
			.from(ballots)
			.innerJoin(votes, eq(ballots.voteId, votes.id))
			.where(eq(votes.committeeId, committeeId))
	]);
	const ms = (arr: { at: Date | string }[]) => arr.map((r) => new Date(r.at).getTime());
	const all = [...ms(msgs), ...ms(speeches), ...ms(mots), ...ms(balls)];
	return {
		timeline: bucketTimeline(all),
		totals: { messages: msgs.length, speeches: speeches.length, motions: mots.length, ballots: balls.length }
	};
}

export type NetworkEdge = { from: string; to: string; count: number; avgReplyLagSec: number | null };

/** Who passed notes to whom — a directed negotiation graph with reply latency. */
export async function getNegotiationNetwork(committeeId: string): Promise<NetworkEdge[]> {
	const rows = await db
		.select({ fromId: notes.fromId, toId: notes.toId, createdAt: notes.createdAt, readAt: notes.readAt })
		.from(notes)
		.where(eq(notes.committeeId, committeeId));
	const label = await rosterLabels(committeeId);

	const edges = new Map<string, { from: string; to: string; count: number; lagSum: number; lagN: number }>();
	for (const r of rows) {
		if (!r.toId) continue; // skip notes to the dais
		const key = `${r.fromId}->${r.toId}`;
		const e = edges.get(key) ?? { from: r.fromId, to: r.toId, count: 0, lagSum: 0, lagN: 0 };
		e.count++;
		if (r.readAt) {
			e.lagSum += new Date(r.readAt).getTime() - new Date(r.createdAt).getTime();
			e.lagN++;
		}
		edges.set(key, e);
	}

	return [...edges.values()]
		.sort((a, b) => b.count - a.count)
		.map((e) => ({
			from: label.get(e.from) ?? '—',
			to: label.get(e.to) ?? '—',
			count: e.count,
			avgReplyLagSec: e.lagN ? Math.round(e.lagSum / e.lagN / 1000) : null
		}));
}
