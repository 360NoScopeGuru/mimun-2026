import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { committees, delegates } from '$lib/server/db/schema';
import { assertConferenceStaff } from '$lib/server/auth/guards';
import { makeInviteCode } from '$lib/server/invite';

const ROLES = ['delegate', 'chair', 'deputy_chair', 'admin', 'secretariat'] as const;
type Role = (typeof ROLES)[number];
const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

/** Loads a delegate by id or returns null. */
async function findDelegate(id: string) {
	if (!id) return null;
	const [row] = await db.select().from(delegates).where(eq(delegates.id, id));
	return row ?? null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	assertConferenceStaff(locals.delegate);

	const committeeFilter = url.searchParams.get('committee');

	const [committeeRows, delegateRows] = await Promise.all([
		db
			.select({ id: committees.id, name: committees.name })
			.from(committees)
			.orderBy(asc(committees.name)),
		db
			.select({
				id: delegates.id,
				fullName: delegates.fullName,
				country: delegates.country,
				role: delegates.role,
				committeeId: delegates.committeeId,
				committeeName: committees.name,
				inviteCode: delegates.inviteCode,
				active: delegates.active
			})
			.from(delegates)
			.leftJoin(committees, eq(delegates.committeeId, committees.id))
			.where(committeeFilter ? eq(delegates.committeeId, committeeFilter) : undefined)
			.orderBy(asc(committees.name), asc(delegates.fullName))
	]);

	return {
		delegates: delegateRows,
		committees: committeeRows,
		roles: ROLES,
		committeeFilter
	};
};

export const actions: Actions = {
	// Move a delegate to a different committee (or unassign with the empty option).
	reassign: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);

		const form = await request.formData();
		const delegateId = String(form.get('delegateId') ?? '');
		const committeeId = String(form.get('committeeId') ?? '').trim() || null;

		const delegate = await findDelegate(delegateId);
		if (!delegate) return fail(404, { message: 'Delegate not found.' });

		if (committeeId) {
			const [committee] = await db
				.select({ id: committees.id })
				.from(committees)
				.where(eq(committees.id, committeeId));
			if (!committee) return fail(400, { message: 'Committee not found.' });
		}

		await db.update(delegates).set({ committeeId }).where(eq(delegates.id, delegate.id));
		return { success: true };
	},

	// Change a delegate's role (validated against the enum).
	setRole: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);

		const form = await request.formData();
		const delegateId = String(form.get('delegateId') ?? '');
		const role = String(form.get('role') ?? '');

		const delegate = await findDelegate(delegateId);
		if (!delegate) return fail(404, { message: 'Delegate not found.' });
		if (!isRole(role)) return fail(400, { message: 'Invalid role.' });

		await db.update(delegates).set({ role }).where(eq(delegates.id, delegate.id));
		return { success: true };
	},

	deactivate: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);

		const delegateId = String((await request.formData()).get('delegateId') ?? '');
		const delegate = await findDelegate(delegateId);
		if (!delegate) return fail(404, { message: 'Delegate not found.' });

		await db.update(delegates).set({ active: 0 }).where(eq(delegates.id, delegate.id));
		return { success: true };
	},

	activate: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);

		const delegateId = String((await request.formData()).get('delegateId') ?? '');
		const delegate = await findDelegate(delegateId);
		if (!delegate) return fail(404, { message: 'Delegate not found.' });

		await db.update(delegates).set({ active: 1 }).where(eq(delegates.id, delegate.id));
		return { success: true };
	},

	// Mint a fresh, conference-unique invite code for the delegate.
	regenerateCode: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);

		const delegateId = String((await request.formData()).get('delegateId') ?? '');
		const delegate = await findDelegate(delegateId);
		if (!delegate) return fail(404, { message: 'Delegate not found.' });

		// Guarantee uniqueness in-process against every existing code, then retry
		// on the (unlikely) DB unique-collision race.
		const used = new Set(
			(await db.select({ code: delegates.inviteCode }).from(delegates)).map((d) => d.code)
		);
		used.delete(delegate.inviteCode);

		for (let attempt = 0; attempt < 25; attempt++) {
			let inviteCode = makeInviteCode(delegate.country, delegate.role);
			while (used.has(inviteCode)) inviteCode = makeInviteCode(delegate.country, delegate.role);

			try {
				await db.update(delegates).set({ inviteCode }).where(eq(delegates.id, delegate.id));
				return { success: true, inviteCode };
			} catch {
				used.add(inviteCode);
			}
		}

		return fail(500, { message: 'Could not generate a unique code — try again.' });
	}
};
