import type { PageServerLoad } from './$types';
import { asc, and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { committees, conferences, delegates } from '$lib/server/db/schema';
import { assertConferenceStaff } from '$lib/server/auth/guards';

export const load: PageServerLoad = async ({ locals }) => {
	assertConferenceStaff(locals.delegate);

	// Every active delegate (role = 'delegate'), joined to their committee and
	// conference, ordered by committee then name — one printable certificate
	// per person. Chairs/dais/staff are excluded; only delegates receive these.
	const certificates = await db
		.select({
			fullName: delegates.fullName,
			country: delegates.country,
			committeeName: committees.name,
			conferenceName: conferences.name
		})
		.from(delegates)
		.innerJoin(committees, eq(delegates.committeeId, committees.id))
		.innerJoin(conferences, eq(committees.conferenceId, conferences.id))
		.where(and(eq(delegates.active, 1), eq(delegates.role, 'delegate')))
		.orderBy(asc(committees.name), asc(delegates.fullName));

	// Distinct committee names (already ordered) for the on-screen filter.
	const committeeNames = [...new Set(certificates.map((c) => c.committeeName))];

	return { certificates, committeeNames };
};
