import { json, error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { crisisUpdates, messages, motions } from '$lib/server/db/schema';
import { loadCommittee, assertMember, assertChair } from '$lib/server/auth/guards';
import { generateCrisisUpdate } from '$lib/server/aiFeatures';
import { isAiConfigured, AiNotConfiguredError } from '$lib/server/ai';
import { enforceRate, RATE_RULES } from '$lib/server/rateLimit';
import { audit } from '$lib/server/audit';
import { log } from '$lib/server/log';

// GET: the crisis feed (members). POST: the chair (director) triggers the next
// AI-generated crisis update, grounded in the committee's recent activity.
export const GET: RequestHandler = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	assertMember(locals.delegate, committee.id);
	const rows = await db
		.select({ id: crisisUpdates.id, text: crisisUpdates.text, kind: crisisUpdates.kind, createdAt: crisisUpdates.createdAt })
		.from(crisisUpdates)
		.where(eq(crisisUpdates.committeeId, committee.id))
		.orderBy(desc(crisisUpdates.createdAt))
		.limit(30);
	return json({ updates: rows.reverse() });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const committee = await loadCommittee(params.slug);
	const chair = assertChair(locals.delegate, committee.id);
	if (!isAiConfigured()) error(503, 'AI is not configured yet.');

	const { directive } = (await request.json().catch(() => ({}))) as { directive?: string };
	await enforceRate(`ai-summary:${chair.id}`, RATE_RULES.aiSummary, 'Too many updates in a row — give it a moment.');

	const cfg = (committee.rulesConfig ?? {}) as { crisisScenario?: string };
	const [recentMsgs, recentMotions] = await Promise.all([
		db.select({ body: messages.body }).from(messages).where(eq(messages.committeeId, committee.id)).orderBy(desc(messages.createdAt)).limit(6),
		db.select({ type: motions.type }).from(motions).where(eq(motions.committeeId, committee.id)).orderBy(desc(motions.createdAt)).limit(4)
	]);
	const recentActions = [
		...recentMotions.map((m) => `motion raised: ${m.type}`),
		...recentMsgs.map((m) => `floor: ${m.body.slice(0, 120)}`)
	];

	try {
		const { text, provider } = await generateCrisisUpdate({
			committeeName: committee.name,
			scenario: cfg.crisisScenario ?? '',
			directive: (directive ?? '').slice(0, 300),
			recentActions
		});
		const [row] = await db
			.insert(crisisUpdates)
			.values({ committeeId: committee.id, kind: 'update', text, authorId: chair.id })
			.returning({ id: crisisUpdates.id, text: crisisUpdates.text, kind: crisisUpdates.kind, createdAt: crisisUpdates.createdAt });
		await audit(committee, chair.id, 'crisis_update', { id: row.id });
		return json({ update: row, provider });
	} catch (err) {
		if (err instanceof AiNotConfiguredError) error(503, 'AI is not configured yet.');
		log.error('crisis update failed', { slug: params.slug }, err);
		error(502, 'Could not generate a crisis update right now. Please try again.');
	}
};
