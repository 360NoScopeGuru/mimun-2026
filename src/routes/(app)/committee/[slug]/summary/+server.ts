import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadCommittee, assertChair } from '$lib/server/auth/guards';
import { getSessionStats } from '$lib/server/sessionStats';
import { summarizeSession } from '$lib/server/aiFeatures';
import { isAiConfigured, AiNotConfiguredError } from '$lib/server/ai';

// Chair-only: a rapporteur-style recap of the session so far.
export const POST: RequestHandler = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	assertChair(locals.delegate, committee.id);

	if (!isAiConfigured()) error(503, 'AI summaries are not configured yet.');

	try {
		const stats = await getSessionStats(committee);
		const { text, provider } = await summarizeSession(stats);
		return json({ summary: text, provider });
	} catch (err) {
		if (err instanceof AiNotConfiguredError) error(503, 'AI summaries are not configured yet.');
		console.error('session summary failed', err);
		error(502, 'Could not generate a summary right now. Please try again.');
	}
};
