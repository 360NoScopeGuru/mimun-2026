import { json, error } from '@sveltejs/kit';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { resolutions, resolutionClauses } from '$lib/server/db/schema';
import { loadCommittee, assertMember } from '$lib/server/auth/guards';
import { detectResolutionOverlap } from '$lib/server/aiFeatures';
import { isAiConfigured, AiNotConfiguredError } from '$lib/server/ai';
import { enforceRate, RATE_RULES } from '$lib/server/rateLimit';
import { log } from '$lib/server/log';

// Checks a draft against the committee's other resolutions for substantive
// overlap / conflicting provisions before it goes to the floor.
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);
	if (!isAiConfigured()) error(503, 'AI is not configured yet.');

	const { resolutionId } = (await request.json().catch(() => ({}))) as { resolutionId?: string };
	if (!resolutionId) error(400, 'Missing resolution.');

	const [draft] = await db
		.select({ id: resolutions.id, title: resolutions.title })
		.from(resolutions)
		.where(and(eq(resolutions.id, resolutionId), eq(resolutions.committeeId, committee.id)));
	if (!draft) error(404, 'Resolution not found.');

	const others = await db
		.select({ id: resolutions.id, title: resolutions.title })
		.from(resolutions)
		.where(and(eq(resolutions.committeeId, committee.id), ne(resolutions.id, draft.id)));
	if (others.length === 0) {
		return json({ overlap: { verdict: 'No other resolutions to compare against yet.', duplicates: [], conflicts: [] }, provider: null });
	}

	await enforceRate(`ai-review:${delegate.id}`, RATE_RULES.aiReview, 'Too many checks in a row — give it a minute.');

	const ids = [draft.id, ...others.map((o) => o.id)];
	const clauseRows = await db
		.select({ resolutionId: resolutionClauses.resolutionId, text: resolutionClauses.text })
		.from(resolutionClauses)
		.where(inArray(resolutionClauses.resolutionId, ids))
		.orderBy(asc(resolutionClauses.position));
	const clausesFor = (rid: string) => clauseRows.filter((c) => c.resolutionId === rid).map((c) => c.text);

	if (clausesFor(draft.id).length === 0) error(400, 'Add some clauses before checking for overlap.');

	try {
		const { data, provider } = await detectResolutionOverlap({
			committeeName: committee.name,
			draft: { title: draft.title, clauses: clausesFor(draft.id) },
			others: others.map((o) => ({ title: o.title, clauses: clausesFor(o.id) }))
		});
		return json({ overlap: data, provider });
	} catch (err) {
		if (err instanceof AiNotConfiguredError) error(503, 'AI is not configured yet.');
		log.error('resolution overlap failed', { slug: params.slug, resolutionId }, err);
		error(502, 'Could not check for overlap right now. Please try again.');
	}
};
