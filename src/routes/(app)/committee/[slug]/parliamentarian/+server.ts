import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { committeeFloor } from '$lib/server/db/schema';
import { loadCommittee, assertMember } from '$lib/server/auth/guards';
import { presetFor } from '$lib/server/procedure';
import { askParliamentarian } from '$lib/server/aiFeatures';
import { isAiConfigured, AiNotConfiguredError } from '$lib/server/ai';
import { enforceRate, RATE_RULES } from '$lib/server/rateLimit';
import { log } from '$lib/server/log';

const MODE_LABEL: Record<string, string> = {
	closed: 'floor closed',
	roll_call: 'roll call in progress',
	formal_debate: 'formal debate',
	moderated_caucus: 'moderated caucus',
	unmoderated_caucus: 'unmoderated caucus',
	voting: 'voting procedure'
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const committee = await loadCommittee(params.slug);
	const delegate = assertMember(locals.delegate, committee.id);

	if (!isAiConfigured()) error(503, 'The AI parliamentarian is not configured yet.');

	const { question } = (await request.json().catch(() => ({}))) as { question?: string };
	const q = (question ?? '').trim();
	if (!q) error(400, 'Ask a question about the rules of procedure.');
	if (q.length > 500) error(400, 'Please keep the question under 500 characters.');

	await enforceRate(
		`ai-qa:${delegate.id}`,
		RATE_RULES.aiQa,
		'Too many questions in a row — give the parliamentarian a moment.'
	);

	const preset = presetFor((committee.rulesConfig as { preset?: string })?.preset);
	const [floor] = await db.select().from(committeeFloor).where(eq(committeeFloor.committeeId, committee.id));
	const modeLabel = MODE_LABEL[floor?.mode ?? 'closed'] ?? 'floor closed';

	try {
		const { text, provider } = await askParliamentarian({
			preset,
			committeeName: committee.name,
			modeLabel,
			question: q
		});
		return json({ answer: text, provider });
	} catch (err) {
		if (err instanceof AiNotConfiguredError) error(503, 'The AI parliamentarian is not configured yet.');
		log.error('parliamentarian failed', { slug: params.slug }, err);
		error(502, 'The parliamentarian is unavailable right now. Please try again.');
	}
};
