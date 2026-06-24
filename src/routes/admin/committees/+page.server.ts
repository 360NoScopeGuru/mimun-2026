import { fail } from '@sveltejs/kit';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { conferences, committees, committeeFloor, delegates } from '$lib/server/db/schema';
import { assertConferenceStaff } from '$lib/server/auth/guards';

const PRESETS = ['THIMUN'] as const;

/** Normalise a free-text slug to lowercase kebab-case. */
function kebab(slug: string): string {
	return slug
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Split a textarea into a trimmed, blank-free string[] of agenda issues. */
function parseAgenda(raw: FormDataEntryValue | null): string[] {
	return String(raw ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

function normalisePreset(raw: FormDataEntryValue | null): string {
	const value = String(raw ?? '').trim();
	return (PRESETS as readonly string[]).includes(value) ? value : 'THIMUN';
}

export const load: PageServerLoad = async ({ locals }) => {
	assertConferenceStaff(locals.delegate);

	const [confRows, commRows, delCounts] = await Promise.all([
		db
			.select({ id: conferences.id, name: conferences.name })
			.from(conferences)
			.orderBy(asc(conferences.name)),
		db
			.select({
				id: committees.id,
				conferenceId: committees.conferenceId,
				name: committees.name,
				slug: committees.slug,
				topic: committees.topic,
				agenda: committees.agenda,
				rulesConfig: committees.rulesConfig,
				status: committees.status
			})
			.from(committees)
			.orderBy(asc(committees.name)),
		db
			.select({ committeeId: delegates.committeeId, c: sql<number>`count(*)`.mapWith(Number) })
			.from(delegates)
			.where(and(eq(delegates.role, 'delegate'), eq(delegates.active, 1)))
			.groupBy(delegates.committeeId)
	]);

	const confName = new Map(confRows.map((conf) => [conf.id, conf.name]));
	const delBy = new Map(delCounts.map((d) => [d.committeeId, d.c]));

	const committeesList = commRows.map((c) => ({
		id: c.id,
		conferenceId: c.conferenceId,
		conferenceName: confName.get(c.conferenceId) ?? 'Unassigned',
		name: c.name,
		slug: c.slug,
		topic: c.topic,
		agenda: (c.agenda ?? []) as string[],
		preset: ((c.rulesConfig as { preset?: string })?.preset ?? 'THIMUN') as string,
		status: c.status,
		delegates: delBy.get(c.id) ?? 0
	}));

	return {
		conferences: confRows,
		committees: committeesList,
		presets: PRESETS
	};
};

export const actions: Actions = {
	createCommittee: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);

		const form = await request.formData();
		const conferenceId = String(form.get('conferenceId') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		const slug = kebab(String(form.get('slug') ?? ''));
		const topic = String(form.get('topic') ?? '').trim();
		const agenda = parseAgenda(form.get('agenda'));
		const preset = normalisePreset(form.get('preset'));

		if (!name) return fail(400, { message: 'Committee name is required.' });
		if (!slug) return fail(400, { message: 'A valid slug is required.' });

		const [conf] = await db
			.select({ id: conferences.id })
			.from(conferences)
			.where(eq(conferences.id, conferenceId));
		if (!conf) return fail(400, { message: 'Choose a conference.' });

		const [existing] = await db
			.select({ id: committees.id })
			.from(committees)
			.where(eq(committees.slug, slug));
		if (existing) return fail(400, { message: `The slug "${slug}" is already taken.` });

		const [created] = await db
			.insert(committees)
			.values({
				conferenceId,
				name,
				slug,
				topic,
				agenda,
				rulesConfig: { preset },
				status: 'pending'
			})
			.returning({ id: committees.id });

		await db.insert(committeeFloor).values({ committeeId: created.id, mode: 'closed' });

		return { success: true };
	},

	updateCommittee: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		const topic = String(form.get('topic') ?? '').trim();
		const agenda = parseAgenda(form.get('agenda'));
		const preset = normalisePreset(form.get('preset'));
		const status = String(form.get('status') ?? '').trim();

		if (!name) return fail(400, { message: 'Committee name is required.' });

		const validStatuses = ['pending', 'in_session', 'suspended', 'closed'] as const;
		if (!(validStatuses as readonly string[]).includes(status)) {
			return fail(400, { message: 'Invalid status.' });
		}

		const [existing] = await db
			.select({ id: committees.id })
			.from(committees)
			.where(eq(committees.id, id));
		if (!existing) return fail(400, { message: 'Committee not found.' });

		await db
			.update(committees)
			.set({
				name,
				topic,
				agenda,
				rulesConfig: { preset },
				status: status as (typeof validStatuses)[number]
			})
			.where(eq(committees.id, id));

		return { success: true };
	}
};
