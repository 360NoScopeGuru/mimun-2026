import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadCommittee, assertMember } from '$lib/server/auth/guards';
import { reviewPositionPaper } from '$lib/server/aiFeatures';
import { isAiConfigured, AiNotConfiguredError } from '$lib/server/ai';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);

	if (!isAiConfigured()) error(503, 'AI feedback is not configured yet.');

	const { text } = (await request.json().catch(() => ({}))) as { text?: string };
	const draft = (text ?? '').trim();
	if (draft.length < 80) error(400, 'Paste at least a paragraph of your position paper to get feedback.');

	try {
		const { data, provider } = await reviewPositionPaper({
			committeeName: committee.name,
			country: delegate.country ?? '',
			topic: committee.topic,
			text: draft
		});
		return json({ feedback: data, provider });
	} catch (err) {
		if (err instanceof AiNotConfiguredError) error(503, 'AI feedback is not configured yet.');
		console.error('position paper feedback failed', err);
		error(502, 'Could not generate feedback right now. Please try again.');
	}
};
