import type { RequestHandler } from './$types';
import { and, asc, desc, eq } from 'drizzle-orm';
import { loadCommittee, assertMember } from '$lib/server/auth/guards';
import { db } from '$lib/server/db';
import { votes, ballots, delegates, attendance } from '$lib/server/db/schema';

/**
 * Live placard board for the projection screen: every voting delegation and how
 * it has voted on the committee's currently-open vote. Polled (~1s) while a vote
 * is in progress so the chamber screen fills in placards as ballots land.
 *
 * Returns `{ vote: null, board: [] }` when nothing is open.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	assertMember(locals.delegate, committee.id);

	// The committee's open vote (latest, in case of a re-vote / second round).
	const [vote] = await db
		.select()
		.from(votes)
		.where(and(eq(votes.committeeId, committee.id), eq(votes.status, 'open')))
		.orderBy(desc(votes.opensAt))
		.limit(1);

	if (!vote) {
		return Response.json({ vote: null, board: [] });
	}

	// Every voting delegation in this committee, with its ballot for the current
	// round (null = placard not yet raised). Delegates ← attendance (present and
	// voting), left-joined to ballots so pending delegations still appear.
	const rows = await db
		.select({
			name: delegates.fullName,
			country: delegates.country,
			choice: ballots.choice
		})
		.from(delegates)
		.innerJoin(
			attendance,
			and(eq(attendance.delegateId, delegates.id), eq(attendance.committeeId, committee.id))
		)
		.leftJoin(
			ballots,
			and(
				eq(ballots.voteId, vote.id),
				eq(ballots.delegateId, delegates.id),
				eq(ballots.round, vote.round)
			)
		)
		.where(
			and(
				eq(delegates.committeeId, committee.id),
				eq(delegates.role, 'delegate'),
				eq(delegates.active, 1),
				eq(attendance.status, 'present_and_voting')
			)
		)
		.orderBy(asc(delegates.country));

	return Response.json({
		vote: {
			id: vote.id,
			label: vote.label,
			method: vote.method,
			round: vote.round,
			majorityRule: vote.majorityRule
		},
		board: rows.map((r) => ({
			name: r.name,
			country: r.country,
			choice: r.choice ?? null
		}))
	});
};
