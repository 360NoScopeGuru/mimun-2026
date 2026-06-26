import { fail } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { rateLimit, RATE_RULES } from '$lib/server/rateLimit';
import {
	committees,
	delegates,
	messages,
	speakerQueue,
	attendance,
	committeeFloor,
	motions,
	points,
	votes,
	ballots,
	resolutions,
	amendments,
	notes
} from '$lib/server/db/schema';
import { loadCommittee, assertMember, assertChair } from '$lib/server/auth/guards';
import { getCommitteeState } from '$lib/server/committeeState';
import { presetFor, tallyBallots, decide, motionDef, motionPrecedence, type BallotChoice } from '$lib/server/procedure';
import { executeMotion, applyAmendment } from '$lib/server/floor';
import { audit } from '$lib/server/audit';
import { isAiConfigured } from '$lib/server/ai';

export const load: PageServerLoad = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);
	const state = await getCommitteeState(committee, delegate);

	// Roster for the note-passing recipient picker (rarely changes — not polled).
	const members = await db
		.select({ id: delegates.id, name: delegates.fullName, country: delegates.country, role: delegates.role })
		.from(delegates)
		.where(and(eq(delegates.committeeId, committee.id), eq(delegates.active, 1)))
		.orderBy(delegates.country);

	return { committee, state, members, aiConfigured: isAiConfigured() };
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

		const [vote] = await db.select().from(votes).where(and(eq(votes.id, voteId), eq(votes.committeeId, committee.id)));
		if (!vote || vote.status !== 'open') return fail(400, { message: 'No open vote' });

		const allowed = vote.method === 'roll_call' ? ['for', 'against', 'abstain', 'pass'] : ['for', 'against', 'abstain'];
		if (!allowed.includes(choice)) return fail(400, { message: 'Invalid choice' });
		// A second round exists precisely to make those who passed now vote — so
		// passing again isn't allowed.
		if (vote.round > 1 && choice === 'pass') return fail(400, { message: 'You must vote this round — passing is no longer allowed' });

		// Procedural votes: any present delegation. Substantive votes: present and voting only.
		const [att] = await db
			.select()
			.from(attendance)
			.where(and(eq(attendance.committeeId, committee.id), eq(attendance.delegateId, delegate.id)));
		if (vote.kind === 'substantive') {
			if (!att || att.status !== 'present_and_voting') return fail(403, { message: 'Only present-and-voting delegations may vote' });
		} else if (!att || att.status === 'absent') {
			return fail(403, { message: 'You must be present to vote' });
		}

		// In a roll-call second round, only delegations that passed may vote.
		if (vote.round > 1) {
			const prior = await db.select({ choice: ballots.choice, round: ballots.round }).from(ballots).where(and(eq(ballots.voteId, vote.id), eq(ballots.delegateId, delegate.id)));
			const latestPrior = prior.sort((a, b) => b.round - a.round)[0];
			if (!latestPrior || latestPrior.choice !== 'pass') return fail(403, { message: 'Only delegations that passed may vote this round' });
		}

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

		// Atomic: close the vote, return the floor to debate, and apply the outcome
		// to its subject together. A mid-sequence failure must not leave a closed
		// vote with an un-updated motion/resolution/amendment (or an amendment
		// marked passed whose clause edit never landed).
		await db.transaction(async (tx) => {
			await tx
				.update(votes)
				.set({ status: 'closed', result, tallyFor: t.for, tallyAgainst: t.against, tallyAbstain: t.abstain, closesAt: new Date() })
				.where(eq(votes.id, vote.id));

			// Default: return to formal debate (executeMotion below may override the mode).
			await tx.update(committeeFloor).set({ mode: 'formal_debate', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));

			// Apply the outcome to the subject.
			if (vote.subjectType === 'motion' && vote.subjectId) {
				const [m] = await tx.select().from(motions).where(eq(motions.id, vote.subjectId));
				if (m) {
					await tx.update(motions).set({ status: result === 'passed' ? 'passed' : 'failed', decidedAt: new Date() }).where(eq(motions.id, m.id));
					if (result === 'passed') await executeMotion(committee, m, tx);
				}
			} else if (vote.subjectType === 'resolution' && vote.subjectId) {
				await tx.update(resolutions).set({ status: result === 'passed' ? 'adopted' : 'failed' }).where(eq(resolutions.id, vote.subjectId));
			} else if (vote.subjectType === 'amendment' && vote.subjectId) {
				const [a] = await tx.select().from(amendments).where(eq(amendments.id, vote.subjectId));
				if (a) {
					await tx.update(amendments).set({ status: result === 'passed' ? 'passed' : 'failed' }).where(eq(amendments.id, a.id));
					if (result === 'passed') await applyAmendment(a, tx);
				}
			}
		});

		await audit(committee, chair.id, 'close_vote', { voteId: vote.id, subjectType: vote.subjectType, result, tally: t });
		return { success: true, result };
	},

	// Roll call: open a second round so delegations that passed must now vote.
	advanceRound: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const voteId = String((await request.formData()).get('voteId') ?? '');
		const [vote] = await db.select().from(votes).where(and(eq(votes.id, voteId), eq(votes.committeeId, committee.id)));
		if (!vote || vote.status !== 'open' || vote.method !== 'roll_call') return fail(400);

		const passes = await db
			.select({ id: ballots.id })
			.from(ballots)
			.where(and(eq(ballots.voteId, vote.id), eq(ballots.round, vote.round), eq(ballots.choice, 'pass')));
		if (passes.length === 0) return fail(400, { message: 'No delegations passed' });

		await db.update(votes).set({ round: vote.round + 1 }).where(eq(votes.id, vote.id));
		await audit(committee, chair.id, 'open_second_round', { voteId: vote.id, round: vote.round + 1 });
		return { success: true };
	},

	// A delegate raises a motion onto the precedence-ordered queue.
	raiseMotion: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const form = await request.formData();
		const type = String(form.get('type') ?? '');
		if (!motionDef(type)) return fail(400, { message: 'Unknown motion' });

		const mp: Record<string, unknown> = {};
		const totalSeconds = Number(form.get('totalSeconds'));
		if (totalSeconds) mp.totalSeconds = Math.min(3600, Math.max(30, totalSeconds));
		const topic = String(form.get('topic') ?? '').slice(0, 200);
		if (topic) mp.topic = topic;
		const targetResolutionId = String(form.get('targetResolutionId') ?? '');
		if (targetResolutionId) mp.targetResolutionId = targetResolutionId;
		const extendSeconds = Number(form.get('extendSeconds'));
		if (extendSeconds) mp.extendSeconds = Math.min(1800, Math.max(30, extendSeconds));

		await db.insert(motions).values({ committeeId: committee.id, proposedById: delegate.id, type: type as typeof motions.$inferInsert.type, params: mp, status: 'proposed', precedenceRank: motionPrecedence(type) });
		return { success: true };
	},

	raisePoint: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const form = await request.formData();
		const type = String(form.get('type') ?? '');
		if (!['order', 'information', 'personal_privilege', 'parliamentary_inquiry'].includes(type)) return fail(400);
		const body = String(form.get('body') ?? '').slice(0, 300);

		await db.insert(points).values({ committeeId: committee.id, byId: delegate.id, type: type as 'order', body });
		return { success: true };
	},

	// Chair puts a pending motion to a procedural vote.
	entertainMotion: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const motionId = String((await request.formData()).get('motionId') ?? '');
		const [m] = await db.select().from(motions).where(and(eq(motions.id, motionId), eq(motions.committeeId, committee.id)));
		if (!m || m.status !== 'proposed') return fail(400);

		await db.update(votes).set({ status: 'closed', closesAt: new Date() }).where(and(eq(votes.committeeId, committee.id), eq(votes.status, 'open')));
		await db.update(motions).set({ status: 'voting' }).where(eq(motions.id, m.id));
		await db.insert(votes).values({ committeeId: committee.id, subjectType: 'motion', subjectId: m.id, label: motionDef(m.type)?.label ?? 'Motion', kind: 'procedural', majorityRule: 'simple', method: 'placard', status: 'open' });
		await db.update(committeeFloor).set({ mode: 'voting', updatedAt: new Date() }).where(eq(committeeFloor.committeeId, committee.id));
		await audit(committee, chair.id, 'entertain_motion', { motionId: m.id, type: m.type });
		return { success: true };
	},

	// Chair override: adopt a motion by unanimous consent (no vote).
	adoptMotion: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const motionId = String((await request.formData()).get('motionId') ?? '');
		const [m] = await db.select().from(motions).where(and(eq(motions.id, motionId), eq(motions.committeeId, committee.id)));
		if (!m || m.status !== 'proposed') return fail(400);

		await db.transaction(async (tx) => {
			await tx.update(motions).set({ status: 'passed', decidedAt: new Date() }).where(eq(motions.id, m.id));
			await executeMotion(committee, m, tx);
		});
		await audit(committee, chair.id, 'adopt_motion_by_consent', { motionId: m.id, type: m.type });
		return { success: true };
	},

	ruleMotion: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const motionId = String((await request.formData()).get('motionId') ?? '');
		await db.update(motions).set({ status: 'withdrawn', decidedAt: new Date() }).where(and(eq(motions.id, motionId), eq(motions.committeeId, committee.id), eq(motions.status, 'proposed')));
		await audit(committee, chair.id, 'rule_motion_out_of_order', { motionId });
		return { success: true };
	},

	// Private diplomatic note to another delegation (or the dais if toId is empty).
	sendNote: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const rl = await rateLimit(`note:${delegate.id}`, RATE_RULES.note);
		if (!rl.allowed) return fail(429, { message: 'Slow down — too many notes in a short time.' });

		const form = await request.formData();
		const toRaw = String(form.get('toId') ?? '');
		const toId = toRaw && toRaw !== 'dais' ? toRaw : null;
		const body = String(form.get('body') ?? '').trim();
		if (!body) return fail(400, { message: 'Note cannot be empty' });
		if (body.length > 500) return fail(400, { message: 'Note is too long' });

		if (toId) {
			const [r] = await db.select({ id: delegates.id }).from(delegates).where(and(eq(delegates.id, toId), eq(delegates.committeeId, committee.id)));
			if (!r) return fail(400, { message: 'Unknown recipient' });
		}

		await db.insert(notes).values({ committeeId: committee.id, fromId: delegate.id, toId, body });
		return { success: true };
	},

	markNotesRead: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);
		await db
			.update(notes)
			.set({ readAt: new Date() })
			.where(and(eq(notes.committeeId, committee.id), eq(notes.toId, delegate.id), isNull(notes.readAt)));
		return { success: true };
	},

	setStatus: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const status = String((await request.formData()).get('status') ?? '');
		if (!['pending', 'in_session', 'suspended', 'closed'].includes(status)) return fail(400);

		await db.update(committees).set({ status: status as typeof committees.$inferInsert.status }).where(eq(committees.id, committee.id));
		await audit(committee, chair.id, 'set_status', { status });
		return { success: true };
	},

	// Crisis committee: chair enables/disables crisis mode (+ optional scenario).
	toggleCrisis: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const chair = assertChair(locals.delegate, committee.id);

		const form = await request.formData();
		const on = String(form.get('on')) === 'true';
		const scenario = String(form.get('scenario') ?? '').slice(0, 500);
		const prev = (committee.rulesConfig ?? {}) as Record<string, unknown>;
		const rulesConfig = { ...prev, crisis: on, crisisScenario: scenario || prev.crisisScenario };
		await db.update(committees).set({ rulesConfig }).where(eq(committees.id, committee.id));
		await audit(committee, chair.id, 'toggle_crisis', { on });
		return { success: true };
	}
};
