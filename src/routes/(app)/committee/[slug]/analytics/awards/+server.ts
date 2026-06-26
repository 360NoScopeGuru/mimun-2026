import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadCommittee, assertChair } from '$lib/server/auth/guards';
import { getParticipation } from '$lib/server/participation';
import { recommendAwards } from '$lib/server/aiFeatures';
import { isAiConfigured, AiNotConfiguredError } from '$lib/server/ai';
import { enforceRate, RATE_RULES } from '$lib/server/rateLimit';
import { log } from '$lib/server/log';

// Chair-only: defensible award recommendations grounded in measured activity.
export const POST: RequestHandler = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	const chair = assertChair(locals.delegate, committee.id);

	if (!isAiConfigured()) error(503, 'AI is not configured yet.');
	await enforceRate(`ai-summary:${chair.id}`, RATE_RULES.aiSummary, 'Too many requests — give it a minute.');

	const rows = await getParticipation(committee.id);
	if (rows.length === 0) error(400, 'No participation data yet — run a session first.');

	try {
		const { data, provider } = await recommendAwards({
			committeeName: committee.name,
			topic: committee.topic,
			delegates: rows.map((r) => ({
				label: r.country || r.name,
				score: r.score,
				speeches: r.speeches,
				motions: r.motions,
				amendments: r.amendments,
				points: r.points,
				messages: r.messages,
				votes: r.votes
			}))
		});
		return json({ awards: data.awards ?? [], provider });
	} catch (err) {
		if (err instanceof AiNotConfiguredError) error(503, 'AI is not configured yet.');
		log.error('award recommendation failed', { slug: params.slug }, err);
		error(502, 'Could not generate awards right now. Please try again.');
	}
};
