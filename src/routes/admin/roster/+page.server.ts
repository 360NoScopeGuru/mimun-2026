import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { committees, delegates, attendance } from '$lib/server/db/schema';
import { assertConferenceStaff } from '$lib/server/auth/guards';
import { makeInviteCode } from '$lib/server/invite';
import { parseRoster } from '$lib/server/roster';

async function loadCommittees() {
	return db
		.select({ id: committees.id, name: committees.name, slug: committees.slug })
		.from(committees)
		.orderBy(committees.name);
}

export const load: PageServerLoad = async ({ locals }) => {
	assertConferenceStaff(locals.delegate);
	return { committees: await loadCommittees() };
};

export const actions: Actions = {
	// Dry run: parse and echo the rows back, no DB writes.
	preview: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);

		const csv = String((await request.formData()).get('csv') ?? '');
		if (!csv.trim()) return fail(400, { message: 'Paste some CSV first.' });

		const { rows } = parseRoster(csv, await loadCommittees());
		return { preview: rows };
	},

	// Commit: insert one delegate (+ an absent attendance row) per valid line.
	import: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);

		const csv = String((await request.formData()).get('csv') ?? '');
		if (!csv.trim()) return fail(400, { message: 'Paste some CSV first.' });

		const { rows } = parseRoster(csv, await loadCommittees());

		// Pre-load every existing invite code so we can guarantee uniqueness
		// in-process; we add freshly minted codes as we go.
		const used = new Set((await db.select({ code: delegates.inviteCode }).from(delegates)).map((d) => d.code));

		const imported: { fullName: string; inviteCode: string; committeeName: string }[] = [];

		for (const row of rows) {
			if (row.error || !row.committeeId) continue;

			let inviteCode = makeInviteCode(row.country, row.role);
			while (used.has(inviteCode)) inviteCode = makeInviteCode(row.country, row.role);
			used.add(inviteCode);

			try {
				const [inserted] = await db
					.insert(delegates)
					.values({
						fullName: row.fullName,
						country: row.country,
						role: row.role as 'delegate' | 'chair' | 'deputy_chair',
						committeeId: row.committeeId,
						inviteCode,
						active: 1
					})
					.returning({ id: delegates.id, fullName: delegates.fullName, inviteCode: delegates.inviteCode });

				await db
					.insert(attendance)
					.values({ committeeId: row.committeeId, delegateId: inserted.id, status: 'absent' })
					.onConflictDoNothing();

				imported.push({ fullName: inserted.fullName, inviteCode: inserted.inviteCode, committeeName: row.committeeName });
			} catch {
				// A single bad row (e.g. a unique-collision race) must not abort the batch.
				used.delete(inviteCode);
			}
		}

		return { imported, skipped: rows.filter((r) => r.error).length };
	}
};
