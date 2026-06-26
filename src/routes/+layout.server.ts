import type { LayoutServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { committees, conferences } from '$lib/server/db/schema';
import { getBranding } from '$lib/server/branding';

// Resolve the signed-in delegate's conference branding for every page (defaults
// pre-login). Cheap single join, only when authenticated.
export const load: LayoutServerLoad = async ({ locals }) => {
	let conference: { settings: unknown } | null = null;
	const committeeId = locals.delegate?.committeeId;
	if (committeeId) {
		const [row] = await db
			.select({ settings: conferences.settings })
			.from(committees)
			.innerJoin(conferences, eq(committees.conferenceId, conferences.id))
			.where(eq(committees.id, committeeId));
		conference = row ?? null;
	}
	return { branding: getBranding(conference) };
};
