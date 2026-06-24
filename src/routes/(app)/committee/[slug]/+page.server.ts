import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { committees, messages, speakerQueue, delegates } from '$lib/server/db/schema';
import { loadCommittee, assertMember, assertChair } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const committee = await loadCommittee(params.slug);
	assertMember(locals.delegate, committee.id);

	const [messageRows, queueRows] = await Promise.all([
		db
			.select({ id: messages.id, body: messages.body, createdAt: messages.createdAt, author: delegates.fullName, country: delegates.country, role: delegates.role })
			.from(messages)
			.innerJoin(delegates, eq(messages.delegateId, delegates.id))
			.where(eq(messages.committeeId, committee.id))
			.orderBy(asc(messages.createdAt))
			.limit(200),
		db
			.select({ id: speakerQueue.id, status: speakerQueue.status, joinedAt: speakerQueue.joinedAt, delegateId: speakerQueue.delegateId, name: delegates.fullName, country: delegates.country })
			.from(speakerQueue)
			.innerJoin(delegates, eq(speakerQueue.delegateId, delegates.id))
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.status, 'waiting')))
			.orderBy(asc(speakerQueue.joinedAt))
	]);

	const [speaking] = await db
		.select({ id: speakerQueue.id, name: delegates.fullName, country: delegates.country })
		.from(speakerQueue)
		.innerJoin(delegates, eq(speakerQueue.delegateId, delegates.id))
		.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.status, 'speaking')));

	return { committee, messages: messageRows, queue: queueRows, speaking: speaking ?? null };
};

export const actions: Actions = {
	sendMessage: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const form = await request.formData();
		const body = String(form.get('body') ?? '').trim();
		if (!body) return fail(400, { message: 'Message cannot be empty' });
		if (body.length > 1000) return fail(400, { message: 'Message is too long' });

		await db.insert(messages).values({ committeeId: committee.id, delegateId: delegate.id, body });

		return { success: true };
	},

	joinQueue: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		const existing = await db
			.select()
			.from(speakerQueue)
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.delegateId, delegate.id), eq(speakerQueue.status, 'waiting')));
		if (existing.length > 0) return fail(400, { message: 'Already in the queue' });

		await db.insert(speakerQueue).values({ committeeId: committee.id, delegateId: delegate.id });

		return { success: true };
	},

	leaveQueue: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		const delegate = assertMember(locals.delegate, committee.id);

		await db
			.update(speakerQueue)
			.set({ status: 'withdrawn' })
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.delegateId, delegate.id), eq(speakerQueue.status, 'waiting')));

		return { success: true };
	},

	callNext: async ({ locals, params }) => {
		const committee = await loadCommittee(params.slug);
		assertChair(locals.delegate, committee.id);

		await db
			.update(speakerQueue)
			.set({ status: 'done' })
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.status, 'speaking')));

		const [next] = await db
			.select({ id: speakerQueue.id, delegateId: speakerQueue.delegateId, name: delegates.fullName, country: delegates.country })
			.from(speakerQueue)
			.innerJoin(delegates, eq(speakerQueue.delegateId, delegates.id))
			.where(and(eq(speakerQueue.committeeId, committee.id), eq(speakerQueue.status, 'waiting')))
			.orderBy(asc(speakerQueue.joinedAt))
			.limit(1);

		if (next) {
			await db.update(speakerQueue).set({ status: 'speaking' }).where(eq(speakerQueue.id, next.id));
		}

		return { success: true };
	},

	setStatus: async ({ request, locals, params }) => {
		const committee = await loadCommittee(params.slug);
		assertChair(locals.delegate, committee.id);

		const form = await request.formData();
		const status = String(form.get('status') ?? '');
		if (!['pending', 'in_session', 'suspended', 'closed'].includes(status)) return fail(400);

		await db
			.update(committees)
			.set({ status: status as typeof committees.$inferInsert.status })
			.where(eq(committees.id, committee.id));

		return { success: true };
	}
};
