import type { PageServerLoad } from './$types';
import { asc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { committees, conferences, delegates } from '$lib/server/db/schema';
import { assertConferenceStaff } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ locals }) => {
	assertConferenceStaff(locals.delegate);

	// All active delegates, joined to their committee + conference, so the
	// secretariat can print one card per person. Delegates with no committee
	// assigned are omitted (they have nothing to attend yet).
	const cards = await db
		.select({
			fullName: delegates.fullName,
			country: delegates.country,
			role: delegates.role,
			inviteCode: delegates.inviteCode,
			committeeName: committees.name,
			conferenceName: conferences.name
		})
		.from(delegates)
		.innerJoin(committees, eq(delegates.committeeId, committees.id))
		.innerJoin(conferences, eq(committees.conferenceId, conferences.id))
		.where(eq(delegates.active, 1))
		.orderBy(asc(committees.name), asc(delegates.fullName));

	// Distinct committee names (already ordered) for the on-screen filter.
	const committeeNames = [...new Set(cards.map((c) => c.committeeName))];

	return { cards, committeeNames };
};
