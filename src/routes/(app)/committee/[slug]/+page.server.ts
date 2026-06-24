import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	committees,
	messages,
	speakerQueue,
	attendance,
	committeeFloor,
	motions,
	votes,
	ballots
} from '$lib/server/db/schema';
import { loadCommittee, assertMember, assertChair } from '$lib/server/auth/guards';
import { getCommitteeState } from '$lib/server/committeeState';
import { presetFor, tallyBallots, decide, type BallotChoice } from '$lib/server/procedure';
import { audit } from '$lib/server/audit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);
	const state = await getCommitteeState(committee, delegate);
	return { committee, state };
};

const secondsFromNow = (s: number) => new Date(Date.now() + s * 1000);

export const actions: Actions = {
	/* ---------------- delegate actions ---------------- */

	sendMessage: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();
		if (!body) return fail(400, { message: 'Message cannot be empty' });
		if (body.length > 1000) return fail(400, { message: 'Message is too long' });

		await db.insert(messages).values({ committeeId: committee.id, delegateId: delegate.id, body });
		return { success: true };
	},

	joinQueue: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const existing = await db
			.select()
			.from(speakerQueue)
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.delegateId, delegate.id), eq(speakerQueue.status, 'waiting')));
		if (existing.length > 0) return fail(400, { message: 'Already in the queue' });

		await db.insert(speakerQueue).values({ committeeId: committee.id, delegateId: delegate.id });
		return { success: true };
	},

	leaveQueue: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		await db
			.update(speakerQueue)
			.set({ status: 'withdrawn' })
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.delegateId, delegate.id), eq(speakerQueue.status, 'waiting')));
		return { success: true };
	},

	// Roll call: a delegate marks their own presence.
	setAttendance: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const status = String((await request.formData()).get('status') ?? '');
		if (!['absent', 'present', 'present_and_voting'].includes(status)) return fail(400);

		await db
			.insert(attendance)
			.values({ committeeId: committee.id, delegateId: delegate.id, status: status as 'present' })
			.onConflictDoUpdate({
				target: [attendance.committeeId, attendance.delegateId],
				set: { status: status as 'present', updatedAt: new Date() }
			});
		return { success: true };
	},

	// Cast (or change) a ballot on the open vote.
	castBallot: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const form = await request.formData();
		const voteId = String(form.get('voteId') ?? '');
		const choice = String(form.get('choice') ?? '');
		if (!['for', 'against', 'abstain'].includes(choice)) return fail(400, { message: 'Invalid choice' });

		const [vote] = await db.select().from(votes).where(and(eq(votes.id, voteId), eq(votes.committeeId, committee.id)));
		if (!vote || vote.status !== 'open') return fail(400, { message: 'No open vote' });

		// Only present-and-voting delegates may vote.
		const [att] = await db
			.select()
			.from(attendance)
			.where(and(eq(attendance.committeeId, committee.id), eq(attendance.delegateId, delegate.id)));
		if (!att || att.status !== 'present_and_voting') return fail(403, { message: 'You are not present and voting' });

		await db
			.insert(ballots)
			.values({ voteId: vote.id, delegateId: delegate.id, choice: choice as BallotChoice, round: vote.round })
			.onConflictDoUpdate({
				target: [ballots.voteId, ballots.delegateId, ballots.round],
				set: { choice: choice as BallotChoice }
			});
		return { success: true };
	},

	/* ---------------- chair actions ---------------- */

	callNext: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);
		const preset = presetFor((committee.rulesConfig as { preset?: string })?.preset);

		await db
			.update(speakerQueue)
			.set({ status: 'done' })
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.status, 'speaking')));

		const [next] = await db
			.select({ id: speakerQueue.id, delegateId: speakerQueue.delegateId })
			.from(speakerQueue)
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.status, 'waiting')))
			.orderBy(speakerQueue.joinedAt)
			.limit(1);

		if (next) {
			await db.update(speakerQueue).set({ status: 'speaking' }).where(eq(speakerQueue.id, next.id));
		}

		await db
			.update(committeeFloor)
			.set({
				currentSpeakerId: next?.delegateId ?? null,
				speakerTimerEndsAt: next ? secondsFromNow(preset.defaults.speakingSeconds) : null,
				updatedAt: new Date()
			})
			.where(eq(committeeFloor.committeeId, committee.id));

		await audit(committee, chair.id, 'recognize_speaker', { delegateId: next?.delegateId ?? null });
		return { success: true };
	},

	openRollCall: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);
		await db.update(committeeFloor).set({ mode: 'roll_call', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
		await db.update(committees).set({ status: 'in_session' }).where(eq(committees.id, committee.id));
		await audit(committee, chair.id, 'open_roll_call');
		return { success: true };
	},

	closeRollCall: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);
		await db.update(committeeFloor).set({ mode: 'formal_debate', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
		await audit(committee, chair.id, 'close_roll_call');
		return { success: true };
	},

	startCaucus: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const form = await request.formData();
		const type = String(form.get('type') ?? '');
		const totalSeconds = Math.min(3600, Math.max(30, Number(form.get('totalSeconds')) || 600));
		const speakingSeconds = Math.min(300, Math.max(10, Number(form.get('speakingSeconds')) || 60));
		const topic = String(form.get('topic') ?? '').slice(0, 200);
		if (type !== 'moderated_caucus' && type !== 'unmoderated_caucus') return fail(400);

		await db.insert(motions).values({
			committeeId: committee.id,
			proposedById: chair.id,
			type,
			params: { totalSeconds, speakingSeconds, topic },
			status: 'passed',
			decidedAt: new Date()
		});

		await db
			.update(committeeFloor)
			.set({
				mode: type,
				caucusTimerEndsAt: secondsFromNow(totalSeconds),
				caucusTopic: topic || null,
				currentSpeakerId: null,
				speakerTimerEndsAt: null,
				updatedAt: new Date()
			})
			.where(eq(committeeFloor.committeeId, committee.id));

		await audit(committee, chair.id, 'start_caucus', { type, totalSeconds, topic });
		return { success: true };
	},

	endCaucus: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);
		await db
			.update(committeeFloor)
			.set({ mode: 'formal_debate', caucusTimerEndsAt: null, caucusTopic: null, updatedAt: new Date() })
			.where(eq(committeeFloor.committeeId, committee.id));
		await audit(committee, chair.id, 'end_caucus');
		return { success: true };
	},

	openVote: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const form = await request.formData();
		const label = String(form.get('label') ?? '').trim().slice(0, 200) || 'Procedural vote';
		const majority = String(form.get('majorityRule') ?? 'simple') === 'two_thirds' ? 'two_thirds' : 'simple';

		// Close any other open votes first.
		await db.update(votes).set({ status: 'closed', closesAt: new Date() }).where(and(eq(votes.committeeId, committee.id), eq(votes.status, 'open')));

		await db.insert(votes).values({
			committeeId: committee.id,
			subjectType: 'motion',
			label,
			kind: 'procedural',
			majorityRule: majority,
			method: 'placard',
			status: 'open'
		});

		await db.update(committeeFloor).set({ mode: 'voting', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
		await audit(committee, chair.id, 'open_vote', { label, majority });
		return { success: true };
	},

	closeVote: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const voteId = String((await request.formData()).get('voteId') ?? '');
		const [vote] = await db.select().from(votes).where(and(eq(votes.id, voteId), eq(votes.committeeId, committee.id)));
		if (!vote || vote.status !== 'open') return fail(400, { message: 'No open vote' });

		const cast = await db.select({ choice: ballots.choice }).from(ballots).where(and(eq(ballots.voteId, vote.id), eq(ballots.round, vote.round)));
		const t = tallyBallots(cast.map((c) => c.choice as BallotChoice));
		const result = decide(t, vote.majorityRule);

		await db
			.update(votes)
			.set({ status: 'closed', result, tallyFor: t.for, tallyAgainst: t.against, tallyAbstain: t.abstain, closesAt: new Date() })
			.where(eq(votes.id, vote.id));
		await db.update(committeeFloor).set({ mode: 'formal_debate', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
		await audit(committee, chair.id, 'close_vote', { voteId: vote.id, result, tally: t });
		return { success: true, result };
	},

	setStatus: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const status = String((await request.formData()).get('status') ?? '');
		if (!['pending', 'in_session', 'suspended', 'closed'].includes(status)) return fail(400);

		await db.update(committees).set({ status: status as typeof committees.$inferInsert.status }).where(eq(committees.id, committee.id));
		await audit(committee, chair.id, 'set_status', { status });
		return { success: true };
	}
};
