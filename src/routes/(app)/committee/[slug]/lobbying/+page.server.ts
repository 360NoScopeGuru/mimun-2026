import { fail } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { resolutions, resolutionClauses, resolutionSponsors, delegates } from '$lib/server/db/schema';
import { loadCommittee, assertMember, isChair } from '$lib/server/auth/guards';
import { audit } from '$lib/server/audit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);

	const resos = await db
		.select({ id: resolutions.id, title: resolutions.title, agendaIssue: resolutions.agendaIssue, mainSubmitterId: resolutions.mainSubmitterId, createdAt: resolutions.createdAt })
		.from(resolutions)
		.where(and(eq(resolutions.committeeId, committee.id), eq(resolutions.status, 'lobbying')))
		.orderBy(asc(resolutions.createdAt));

	const ids = resos.map((r) => r.id);
	const [sponsorRows, clauseCounts] = await Promise.all([
		ids.length
			? db
					.select({ resolutionId: resolutionSponsors.resolutionId, role: resolutionSponsors.role, delegateId: resolutionSponsors.delegateId, name: delegates.fullName, country: delegates.country })
					.from(resolutionSponsors)
					.innerJoin(delegates, eq(resolutionSponsors.delegateId, delegates.id))
					.where(inArray(resolutionSponsors.resolutionId, ids))
			: Promise.resolve([]),
		ids.length
			? db.select({ resolutionId: resolutionClauses.resolutionId, c: sql<number>`count(*)`.mapWith(Number) }).from(resolutionClauses).where(inArray(resolutionClauses.resolutionId, ids)).groupBy(resolutionClauses.resolutionId)
			: Promise.resolve([])
	]);

	const clauseBy = new Map(clauseCounts.map((c) => [c.resolutionId, c.c]));
	const items = resos.map((r) => {
		const sponsors = sponsorRows.filter((s) => s.resolutionId === r.id);
		const main = sponsors.find((s) => s.delegateId === r.mainSubmitterId);
		return {
			id: r.id,
			title: r.title,
			agendaIssue: r.agendaIssue,
			mainSubmitter: main ? main.country || main.name : '—',
			coSubmitters: sponsors.filter((s) => s.role !== 'main_submitter').map((s) => s.country || s.name),
			clauses: clauseBy.get(r.id) ?? 0,
			isMine: r.mainSubmitterId === delegate.id,
			amSponsor: sponsors.some((s) => s.delegateId === delegate.id)
		};
	});

	return { committee, items };
};

export const actions: Actions = {
	// Join a lobbying draft as a co-submitter.
	coSponsor: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);
		const resolutionId = String((await request.formData()).get('resolutionId') ?? '');

		const [r] = await db.select().from(resolutions).where(and(eq(resolutions.id, resolutionId), eq(resolutions.committeeId, committee.id)));
		if (!r || r.status !== 'lobbying') return fail(400, { message: 'Not a lobbying draft' });
		if (r.mainSubmitterId === delegate.id) return fail(400, { message: 'You are the main submitter' });

		await db.insert(resolutionSponsors).values({ resolutionId, delegateId: delegate.id, role: 'co_submitter' }).onConflictDoNothing();
		return { success: true };
	},

	// Merge the main submitter's own draft (source) into another (target):
	// the source's clauses + sponsors move to the target; the source is withdrawn.
	mergeInto: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const form = await request.formData();
		const sourceId = String(form.get('sourceId') ?? '');
		const targetId = String(form.get('targetId') ?? '');
		if (!sourceId || !targetId || sourceId === targetId) return fail(400);

		const [source] = await db.select().from(resolutions).where(and(eq(resolutions.id, sourceId), eq(resolutions.committeeId, committee.id)));
		const [target] = await db.select().from(resolutions).where(and(eq(resolutions.id, targetId), eq(resolutions.committeeId, committee.id)));
		if (!source || !target) return fail(404);
		if (source.status !== 'lobbying' || target.status !== 'lobbying') return fail(400, { message: 'Both drafts must be in lobbying' });
		if (source.mainSubmitterId !== delegate.id && !isChair(delegate)) return fail(403, { message: 'Only the main submitter may merge their draft' });

		// Append source clauses after the target's existing clauses (per kind).
		const targetClauses = await db.select({ kind: resolutionClauses.kind, position: resolutionClauses.position }).from(resolutionClauses).where(eq(resolutionClauses.resolutionId, targetId));
		const nextPos: Record<string, number> = { preambulatory: 0, operative: 0 };
		for (const c of targetClauses) nextPos[c.kind] = Math.max(nextPos[c.kind], c.position + 1);

		const sourceClauses = await db.select().from(resolutionClauses).where(eq(resolutionClauses.resolutionId, sourceId)).orderBy(asc(resolutionClauses.position));
		for (const c of sourceClauses) {
			await db.insert(resolutionClauses).values({ resolutionId: targetId, kind: c.kind, position: nextPos[c.kind]++, text: c.text });
		}

		// Move source sponsors (and its main submitter) onto the target as co-submitters.
		const sourceSponsors = await db.select({ delegateId: resolutionSponsors.delegateId }).from(resolutionSponsors).where(eq(resolutionSponsors.resolutionId, sourceId));
		const sponsorIds = new Set(sourceSponsors.map((s) => s.delegateId));
		if (source.mainSubmitterId) sponsorIds.add(source.mainSubmitterId);
		for (const did of sponsorIds) {
			await db.insert(resolutionSponsors).values({ resolutionId: targetId, delegateId: did, role: 'co_submitter' }).onConflictDoNothing();
		}

		await db.update(resolutions).set({ status: 'withdrawn' }).where(eq(resolutions.id, sourceId));
		await audit(committee, delegate.id, 'merge_resolution', { sourceId, targetId });
		return { success: true };
	}
};
