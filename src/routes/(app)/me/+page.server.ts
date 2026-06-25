import { and, count, eq, isNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { committees, files, notes } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	const delegate = locals.delegate!;

	const base = {
		delegate: { fullName: delegate.fullName, country: delegate.country, role: delegate.role },
		committee: null as { name: string; slug: string; topic: string } | null,
		hasPositionPaper: false,
		unreadNotes: 0
	};

	if (!delegate.committeeId) return base;

	const committeeId = delegate.committeeId;

	const [committee, paper, unread] = await Promise.all([
		db
			.select({ id: committees.id, name: committees.name, slug: committees.slug, topic: committees.topic })
			.from(committees)
			.where(eq(committees.id, committeeId))
			.limit(1),
		db
			.select({ id: files.id })
			.from(files)
			.where(
				and(
					eq(files.committeeId, committeeId),
					eq(files.kind, 'position_paper'),
					eq(files.delegateId, delegate.id)
				)
			)
			.limit(1),
		db
			.select({ value: count() })
			.from(notes)
			.where(and(eq(notes.committeeId, committeeId), eq(notes.toId, delegate.id), isNull(notes.readAt)))
	]);

	const seated = committee[0];
	if (!seated) return base;

	return {
		...base,
		committee: { name: seated.name, slug: seated.slug, topic: seated.topic },
		hasPositionPaper: paper.length > 0,
		unreadNotes: unread[0]?.value ?? 0
	};
};
