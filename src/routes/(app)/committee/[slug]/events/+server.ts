import { error } from '@sveltejs/kit';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { committees, messages, speakerQueue, delegates } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const delegate = locals.delegate;
	if (!delegate) error(401);

	const [committee] = await db.select().from(committees).where(eq(committees.slug, params.slug));
	if (!committee) error(404);
	if (delegate.role !== 'admin' && delegate.committeeId !== committee.id) error(403);

	const since = url.searchParams.get('since');
	const sinceDate = since ? new Date(since) : new Date(0);

	const [newMessages, queueRows, speakingRows] = await Promise.all([
		db
			.select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, author: delegates.fullName, country: delegates.country, role: delegates.role })
			.from(messages)
			.innerJoin(delegates, eq(messages.delegateId, delegates.id))
			.where(and(eq(messages.committeeId, committee.id), gt(messages.createdAt, sinceDate)))
			.orderBy(asc(messages.createdAt)),
		db
			.select({ id: speakerQueue.id, status: speakerQueue.status, joinedAt: speakerQueue.joinedAt, delegateId: speakerQueue.delegateId, name: delegates.fullName, country: delegates.country })
			.from(speakerQueue)
			.innerJoin(delegates, eq(speakerQueue.delegateId, delegates.id))
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.status, 'waiting')))
			.orderBy(asc(speakerQueue.joinedAt)),
		db
			.select({ id: speakerQueue.id, name: delegates.fullName, country: delegates.country })
			.from(speakerQueue)
			.innerJoin(delegates, eq(speakerQueue.delegateId, delegates.id))
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.status, 'speaking')))
	]);

	return Response.json({
		messages: newMessages,
		queue: queueRows,
		speaking: speakingRows[0] ?? null,
		status: committee.status
	});
};
