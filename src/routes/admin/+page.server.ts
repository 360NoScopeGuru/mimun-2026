import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { committees } from '$lib/server/db/schema';
import { getConferenceOverview } from '$lib/server/admin';
import { assertConferenceStaff } from '$lib/server/auth/guards';

export const load: PageServerLoad = async () => {
	return { overview: await getConferenceOverview() };
};

// Broadcast = a current announcement stored on every committee's rulesConfig
// jsonb (no new table). The room reads it from its live poll and shows a banner.
export const actions: Actions = {
	broadcast: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);
		const text = String((await request.formData()).get('text') ?? '').trim().slice(0, 280);
		if (!text) return fail(400, { message: 'Message is empty' });
		const announcement = { text, at: new Date().toISOString() };
		const all = await db.select({ id: committees.id, rulesConfig: committees.rulesConfig }).from(committees);
		for (const c of all) {
			await db.update(committees).set({ rulesConfig: { ...((c.rulesConfig ?? {}) as Record<string, unknown>), announcement } }).where(eq(committees.id, c.id));
		}
		return { success: true };
	},

	clearBroadcast: async ({ locals }) => {
		assertConferenceStaff(locals.delegate);
		const all = await db.select({ id: committees.id, rulesConfig: committees.rulesConfig }).from(committees);
		for (const c of all) {
			const cfg = { ...((c.rulesConfig ?? {}) as Record<string, unknown>) };
			delete cfg.announcement;
			await db.update(committees).set({ rulesConfig: cfg }).where(eq(committees.id, c.id));
		}
		return { success: true };
	}
};
