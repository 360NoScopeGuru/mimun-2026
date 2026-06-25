import { and, asc, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from './db';
import {
	committees,
	delegates,
	messages,
	speakerQueue,
	attendance,
	committeeFloor,
	votes,
	ballots,
	motions,
	points,
	notes,
	resolutions
} from './db/schema';
import { presetFor, tallyBallots, quorumThreshold, hasQuorum, sortByPrecedence, motionDef, type BallotChoice } from './procedure';
import { isChair } from './auth/guards';

type Committee = typeof committees.$inferSelect;
type Delegate = typeof delegates.$inferSelect;

const MOTION_LABELS: Record<string, string> = {
	moderated_caucus: 'Moderated caucus',
	unmoderated_caucus: 'Unmoderated caucus',
	extend_debate: 'Extend debate',
	introduce_resolution: 'Introduce resolution',
	move_to_voting: 'Move to voting procedure',
	adjourn_debate: 'Adjourn debate',
	suspend_session: 'Suspend session',
	close_debate: 'Close debate'
};

/**
 * The full live snapshot of a committee floor, used by both the initial page
 * load (sinceISO omitted → all recent messages) and the polling endpoint
 * (sinceISO set → only newer messages). Timers are returned as `endsAt`
 * timestamps so clients count down locally.
 */
export async function getCommitteeState(committee: Committee, delegate: Delegate, sinceISO?: string) {
	const sinceDate = sinceISO ? new Date(sinceISO) : new Date(0);
	const preset = presetFor((committee.rulesConfig as { preset?: string })?.preset);
	const chairView = isChair(delegate); // the dais moderates all notes; delegates see only their own
	const noteFrom = alias(delegates, 'note_from');
	const noteTo = alias(delegates, 'note_to');

	const [floorRow] = await db.select().from(committeeFloor).where(eq(committeeFloor.committeeId, committee.id));

	const [messageRows, queueRows, roster, attendanceRows, openVote, latestResolution, pendingMotionRows, pointRows, noteRows] = await Promise.all([
		db
			.select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, author: delegates.fullName, country: delegates.country, role: delegates.role })
			.from(messages)
			.innerJoin(delegates, eq(messages.delegateId, delegates.id))
			.where(sinceISO ? and(eq(messages.committeeId, committee.id), gt(messages.createdAt, sinceDate)) : eq(messages.committeeId, committee.id))
			.orderBy(asc(messages.createdAt))
			.limit(sinceISO ? 100 : 200),
		db
			.select({ id: speakerQueue.id, joinedAt: speakerQueue.joinedAt, delegateId: speakerQueue.delegateId, name: delegates.fullName, country: delegates.country })
			.from(speakerQueue)
			.innerJoin(delegates, eq(speakerQueue.delegateId, delegates.id))
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.status, 'waiting')))
			.orderBy(asc(speakerQueue.joinedAt)),
		db
			.select({ id: delegates.id, role: delegates.role })
			.from(delegates)
			.where(and(eq(delegates.committeeId, committee.id), eq(delegates.active, 1))),
		db
			.select({ delegateId: attendance.delegateId, status: attendance.status, role: delegates.role })
			.from(attendance)
			.innerJoin(delegates, eq(attendance.delegateId, delegates.id))
			.where(eq(attendance.committeeId, committee.id)),
		db
			.select()
			.from(votes)
			.where(and(eq(votes.committeeId, committee.id), eq(votes.status, 'open')))
			.orderBy(desc(votes.opensAt))
			.limit(1),
		db
			.select({ id: resolutions.id, designation: resolutions.designation, title: resolutions.title, status: resolutions.status, agendaIssue: resolutions.agendaIssue })
			.from(resolutions)
			.where(eq(resolutions.committeeId, committee.id))
			.orderBy(desc(resolutions.createdAt))
			.limit(1),
		db
			.select({ id: motions.id, type: motions.type, params: motions.params, createdAt: motions.createdAt, proposer: delegates.fullName, proposerCountry: delegates.country })
			.from(motions)
			.innerJoin(delegates, eq(motions.proposedById, delegates.id))
			.where(and(eq(motions.committeeId, committee.id), eq(motions.status, 'proposed'))),
		db
			.select({ id: points.id, type: points.type, body: points.body, createdAt: points.createdAt, by: delegates.fullName, byCountry: delegates.country })
			.from(points)
			.innerJoin(delegates, eq(points.byId, delegates.id))
			.where(and(eq(points.committeeId, committee.id), isNull(points.resolvedAt)))
			.orderBy(desc(points.createdAt))
			.limit(10),
		db
			.select({
				id: notes.id,
				body: notes.body,
				createdAt: notes.createdAt,
				readAt: notes.readAt,
				fromId: notes.fromId,
				toId: notes.toId,
				fromName: noteFrom.fullName,
				fromCountry: noteFrom.country,
				toName: noteTo.fullName,
				toCountry: noteTo.country
			})
			.from(notes)
			.innerJoin(noteFrom, eq(notes.fromId, noteFrom.id))
			.leftJoin(noteTo, eq(notes.toId, noteTo.id))
			.where(
				chairView
					? eq(notes.committeeId, committee.id)
					: and(eq(notes.committeeId, committee.id), or(eq(notes.fromId, delegate.id), eq(notes.toId, delegate.id)))
			)
			.orderBy(asc(notes.createdAt))
			.limit(200)
	]);

	// Current speaker (if any)
	let currentSpeaker: { id: string; name: string; country: string } | null = null;
	if (floorRow?.currentSpeakerId) {
		const [s] = await db
			.select({ id: delegates.id, name: delegates.fullName, country: delegates.country })
			.from(delegates)
			.where(eq(delegates.id, floorRow.currentSpeakerId));
		currentSpeaker = s ?? null;
	}

	// Attendance / quorum (only country delegates count toward quorum + majorities)
	const totalMembers = roster.filter((r) => r.role === 'delegate').length;
	const present = attendanceRows.filter((a) => a.role === 'delegate' && a.status !== 'absent').length;
	const voting = attendanceRows.filter((a) => a.role === 'delegate' && a.status === 'present_and_voting').length;
	const mine = attendanceRows.find((a) => a.delegateId === delegate.id)?.status ?? 'absent';

	// Open vote + my ballot + live tally
	let vote = null;
	if (openVote[0]) {
		const v = openVote[0];
		// Count each delegation's latest ballot across rounds (roll-call second rounds).
		const cast = await db
			.select({ delegateId: ballots.delegateId, choice: ballots.choice, round: ballots.round })
			.from(ballots)
			.where(eq(ballots.voteId, v.id));
		const latest = new Map<string, BallotChoice>();
		for (const b of [...cast].sort((a, b) => a.round - b.round)) latest.set(b.delegateId, b.choice as BallotChoice);
		const tally = tallyBallots([...latest.values()]);
		const myChoice = latest.get(delegate.id) ?? null;

		let label = v.label;
		if (!label && v.subjectType === 'motion' && v.subjectId) {
			const [m] = await db.select({ type: motions.type }).from(motions).where(eq(motions.id, v.subjectId));
			if (m) label = MOTION_LABELS[m.type] ?? 'Motion';
		}
		if (!label) label = 'Vote';

		vote = {
			id: v.id,
			subjectType: v.subjectType,
			kind: v.kind,
			majorityRule: v.majorityRule,
			method: v.method,
			round: v.round,
			label,
			tally,
			myChoice
		};
	}

	return {
		status: committee.status,
		floor: {
			mode: floorRow?.mode ?? 'closed',
			currentSpeaker,
			speakerTimerEndsAt: floorRow?.speakerTimerEndsAt ?? null,
			caucusTimerEndsAt: floorRow?.caucusTimerEndsAt ?? null,
			caucusTopic: floorRow?.caucusTopic ?? null,
			debateSide: floorRow?.debateSide ?? null,
			activeResolutionId: floorRow?.activeResolutionId ?? null
		},
		messages: messageRows,
		queue: queueRows,
		attendance: {
			total: totalMembers,
			present,
			voting,
			quorumThreshold: quorumThreshold(totalMembers, preset.quorumFraction),
			hasQuorum: hasQuorum(present, totalMembers, preset.quorumFraction),
			mine
		},
		vote,
		resolution: latestResolution[0] ?? null,
		pendingMotions: sortByPrecedence(pendingMotionRows).map((m) => ({
			id: m.id,
			type: m.type,
			label: motionDef(m.type)?.label ?? m.type,
			params: m.params as Record<string, unknown>,
			proposer: m.proposer,
			proposerCountry: m.proposerCountry
		})),
		points: pointRows,
		notes: noteRows
	};
}

export type CommitteeState = Awaited<ReturnType<typeof getCommitteeState>>;
