import { json, error } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { resolutions, resolutionClauses } from '$lib/server/db/schema';
import { loadCommittee, assertMember } from '$lib/server/auth/guards';
import { reviewResolution } from '$lib/server/aiFeatures';
import { isAiConfigured, AiNotConfiguredError } from '$lib/server/ai';
import { enforceRate, RATE_RULES } from '$lib/server/rateLimit';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);

	if (!isAiConfigured()) error(503, 'AI feedback is not configured yet.');

	const { resolutionId } = (await request.json().catch(() => ({}))) as { resolutionId?: string };
	if (!resolutionId) error(400, 'Missing resolution.');

	const [r] = await db
		.select()
		.from(resolutions)
		.where(and(eq(resolutions.id, resolutionId), eq(resolutions.committeeId, committee.id)));
	if (!r) error(404, 'Resolution not found.');

	const clauses = await db
		.select({ kind: resolutionClauses.kind, text: resolutionClauses.text })
		.from(resolutionClauses)
		.where(eq(resolutionClauses.resolutionId, r.id))
		.orderBy(asc(resolutionClauses.position));

	if (clauses.length === 0) error(400, 'Add some clauses before requesting feedback.');

	await enforceRate(`ai-review:${delegate.id}`, RATE_RULES.aiReview, 'Too many review requests — give it a minute.');

	try {
		const { data, provider } = await reviewResolution({
			committeeName: committee.name,
			agendaIssue: r.agendaIssue,
			title: r.title,
			preambulatory: clauses.filter((c) => c.kind === 'preambulatory').map((c) => c.text),
			operative: clauses.filter((c) => c.kind === 'operative').map((c) => c.text)
		});
		return json({ feedback: data, provider });
	} catch (err) {
		if (err instanceof AiNotConfiguredError) error(503, 'AI feedback is not configured yet.');
		console.error('resolution feedback failed', err);
		error(502, 'Could not generate feedback right now. Please try again.');
	}
};
