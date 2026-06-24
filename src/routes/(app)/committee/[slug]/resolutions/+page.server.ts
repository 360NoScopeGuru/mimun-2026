import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { resolutions, resolutionClauses, resolutionSponsors, amendments, delegates } from '$lib/server/db/schema';
import { loadCommittee, assertMember, isChair } from '$lib/server/auth/guards';
import { applyAmendment, openSubstantiveVote } from '$lib/server/floor';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);

	const list = await db
		.select({ id: resolutions.id, title: resolutions.title, designation: resolutions.designation, status: resolutions.status })
		.from(resolutions)
		.where(eq(resolutions.committeeId, committee.id))
		.orderBy(desc(resolutions.createdAt));

	const selectedId = url.searchParams.get('id') ?? list[0]?.id ?? null;
	let selected = null;

	if (selectedId) {
		const [r] = await db.select().from(resolutions).where(and(eq(resolutions.id, selectedId), eq(resolutions.committeeId, committee.id)));
		if (r) {
			const [clauseRows, sponsorRows, mainSubmitter, amendmentRows] = await Promise.all([
				db.select().from(resolutionClauses).where(eq(resolutionClauses.resolutionId, r.id)).orderBy(asc(resolutionClauses.position)),
				db
					.select({ role: resolutionSponsors.role, name: delegates.fullName, country: delegates.country })
					.from(resolutionSponsors)
					.innerJoin(delegates, eq(resolutionSponsors.delegateId, delegates.id))
					.where(eq(resolutionSponsors.resolutionId, r.id)),
				r.mainSubmitterId
					? db.select({ name: delegates.fullName, country: delegates.country }).from(delegates).where(eq(delegates.id, r.mainSubmitterId))
					: Promise.resolve([]),
				db
					.select({ id: amendments.id, type: amendments.type, action: amendments.action, text: amendments.text, status: amendments.status, targetClauseId: amendments.targetClauseId, proposer: delegates.fullName, proposerCountry: delegates.country })
					.from(amendments)
					.innerJoin(delegates, eq(amendments.proposedById, delegates.id))
					.where(eq(amendments.resolutionId, r.id))
					.orderBy(asc(amendments.createdAt))
			]);

			const preambulatory = clauseRows.filter((c) => c.kind === 'preambulatory');
			const operative = clauseRows.filter((c) => c.kind === 'operative');
			const isMainSubmitter = r.mainSubmitterId === delegate.id;
			const canApprove = isChair(delegate);
			const canEdit = canApprove || isMainSubmitter;

			selected = { ...r, preambulatory, operative, sponsors: sponsorRows, mainSubmitter: mainSubmitter[0] ?? null, amendments: amendmentRows, canEdit, canApprove, isMainSubmitter };
		}
	}

	return { committee, list, selected };
};

export const actions: Actions = {
	createDraft: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim().slice(0, 240);
		const agendaIssue = String(form.get('agendaIssue') ?? '').trim().slice(0, 240);
		if (!title) return fail(400, { message: 'A title is required' });

		const [r] = await db
			.insert(resolutions)
			.values({ committeeId: committee.id, title, agendaIssue, mainSubmitterId: delegate.id, status: 'lobbying' })
			.returning({ id: resolutions.id });

		// The author is the main submitter.
		await db.insert(resolutionSponsors).values({ resolutionId: r.id, delegateId: delegate.id, role: 'main_submitter' }).onConflictDoNothing();

		return { success: true, id: r.id };
	},

	addClause: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const form = await request.formData();
		const resolutionId = String(form.get('resolutionId') ?? '');
		const kind = String(form.get('kind') ?? '');
		const text = String(form.get('text') ?? '').trim().slice(0, 1000);
		if (kind !== 'preambulatory' && kind !== 'operative') return fail(400);
		if (!text) return fail(400, { message: 'Clause text is required' });

		const [r] = await db.select().from(resolutions).where(and(eq(resolutions.id, resolutionId), eq(resolutions.committeeId, committee.id)));
		if (!r) return fail(404);
		if (!isChair(delegate) && r.mainSubmitterId !== delegate.id) return fail(403, { message: 'Only the main submitter may edit' });

		const existing = await db.select({ position: resolutionClauses.position }).from(resolutionClauses).where(and(eq(resolutionClauses.resolutionId, r.id), eq(resolutionClauses.kind, kind)));
		const nextPos = existing.length;

		await db.insert(resolutionClauses).values({ resolutionId: r.id, kind, position: nextPos, text });
		return { success: true };
	},

	// THIMUN lifecycle: main submitter sends a draft to the approval panel.
	submitResolution: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);
		const id = String((await request.formData()).get('resolutionId') ?? '');

		const [r] = await db.select().from(resolutions).where(and(eq(resolutions.id, id), eq(resolutions.committeeId, committee.id)));
		if (!r) return fail(404);
		if (!isChair(delegate) && r.mainSubmitterId !== delegate.id) return fail(403, { message: 'Only the main submitter may submit' });
		if (r.status !== 'lobbying') return fail(400, { message: 'Already submitted' });

		await db.update(resolutions).set({ status: 'submitted' }).where(eq(resolutions.id, r.id));
		return { success: true };
	},

	// Approval panel (dais): approve a submitted draft and assign a designation.
	approveResolution: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);
		if (!isChair(delegate)) return fail(403, { message: 'Dais only' });

		const id = String((await request.formData()).get('resolutionId') ?? '');
		const [r] = await db.select().from(resolutions).where(and(eq(resolutions.id, id), eq(resolutions.committeeId, committee.id)));
		if (!r || r.status !== 'submitted') return fail(400);

		let designation = r.designation;
		if (!designation) {
			const all = await db.select({ d: resolutions.designation }).from(resolutions).where(eq(resolutions.committeeId, committee.id));
			designation = String(all.filter((x) => x.d).length + 1);
		}

		await db.update(resolutions).set({ status: 'approved', approvedAt: new Date(), designation }).where(eq(resolutions.id, r.id));
		return { success: true };
	},

	returnResolution: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);
		if (!isChair(delegate)) return fail(403, { message: 'Dais only' });

		const id = String((await request.formData()).get('resolutionId') ?? '');
		await db.update(resolutions).set({ status: 'lobbying' }).where(and(eq(resolutions.id, id), eq(resolutions.committeeId, committee.id), eq(resolutions.status, 'submitted')));
		return { success: true };
	},

	proposeAmendment: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const form = await request.formData();
		const resolutionId = String(form.get('resolutionId') ?? '');
		const type = String(form.get('type') ?? '');
		const action = String(form.get('action') ?? '');
		const text = String(form.get('text') ?? '').trim().slice(0, 1000);
		const targetClauseId = String(form.get('targetClauseId') ?? '') || null;
		if (type !== 'friendly' && type !== 'unfriendly') return fail(400);
		if (!['add', 'amend', 'strike'].includes(action)) return fail(400);
		if (action !== 'strike' && !text) return fail(400, { message: 'Amendment text is required' });
		if (action !== 'add' && !targetClauseId) return fail(400, { message: 'Select a clause to amend or strike' });

		const [r] = await db.select().from(resolutions).where(and(eq(resolutions.id, resolutionId), eq(resolutions.committeeId, committee.id)));
		if (!r) return fail(404);

		await db.insert(amendments).values({ resolutionId: r.id, targetClauseId, type: type as 'friendly', action: action as 'add', text, proposedById: delegate.id, status: 'proposed' });
		return { success: true };
	},

	// Friendly amendment accepted by the main submitter (or dais) — applied directly.
	acceptAmendment: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const id = String((await request.formData()).get('amendmentId') ?? '');
		const [a] = await db
			.select()
			.from(amendments)
			.innerJoin(resolutions, eq(amendments.resolutionId, resolutions.id))
			.where(and(eq(amendments.id, id), eq(resolutions.committeeId, committee.id)));
		if (!a) return fail(404);
		const amendment = a.amendments;
		const resolution = a.resolutions;
		if (amendment.status !== 'proposed') return fail(400);
		if (!isChair(delegate) && resolution.mainSubmitterId !== delegate.id) return fail(403, { message: 'Only the main submitter may accept' });

		await db.update(amendments).set({ status: 'passed' }).where(eq(amendments.id, amendment.id));
		await applyAmendment(amendment);
		return { success: true };
	},

	// Unfriendly amendment put to a substantive vote on the floor (dais).
	voteAmendment: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);
		if (!isChair(delegate)) return fail(403, { message: 'Dais only' });

		const id = String((await request.formData()).get('amendmentId') ?? '');
		const [a] = await db.select().from(amendments).where(eq(amendments.id, id));
		if (!a || a.status !== 'proposed') return fail(400);

		await db.update(amendments).set({ status: 'voting' }).where(eq(amendments.id, a.id));
		await openSubstantiveVote(committee, 'amendment', a.id, 'Amendment to the resolution', 'roll_call');
		return { success: true };
	},

	rejectAmendment: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const id = String((await request.formData()).get('amendmentId') ?? '');
		const [a] = await db
			.select()
			.from(amendments)
			.innerJoin(resolutions, eq(amendments.resolutionId, resolutions.id))
			.where(and(eq(amendments.id, id), eq(resolutions.committeeId, committee.id)));
		if (!a) return fail(404);
		if (!isChair(delegate) && a.resolutions.mainSubmitterId !== delegate.id) return fail(403);

		await db.update(amendments).set({ status: 'withdrawn' }).where(eq(amendments.id, a.amendments.id));
		return { success: true };
	}
};
