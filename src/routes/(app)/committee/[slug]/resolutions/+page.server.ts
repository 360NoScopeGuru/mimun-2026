import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { resolutions, resolutionClauses, resolutionSponsors, delegates } from '$lib/server/db/schema';
import { loadCommittee, assertMember, isChair } from '$lib/server/auth/guards';

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
			const [clauseRows, sponsorRows, mainSubmitter] = await Promise.all([
				db.select().from(resolutionClauses).where(eq(resolutionClauses.resolutionId, r.id)).orderBy(asc(resolutionClauses.position)),
				db
					.select({ role: resolutionSponsors.role, name: delegates.fullName, country: delegates.country })
					.from(resolutionSponsors)
					.innerJoin(delegates, eq(resolutionSponsors.delegateId, delegates.id))
					.where(eq(resolutionSponsors.resolutionId, r.id)),
				r.mainSubmitterId
					? db.select({ name: delegates.fullName, country: delegates.country }).from(delegates).where(eq(delegates.id, r.mainSubmitterId))
					: Promise.resolve([])
			]);

			const preambulatory = clauseRows.filter((c) => c.kind === 'preambulatory');
			const operative = clauseRows.filter((c) => c.kind === 'operative');
			const canEdit = isChair(delegate) || r.mainSubmitterId === delegate.id;

			selected = { ...r, preambulatory, operative, sponsors: sponsorRows, mainSubmitter: mainSubmitter[0] ?? null, canEdit };
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
	}
};
