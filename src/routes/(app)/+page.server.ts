import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { committees } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	const delegate = locals.delegate!;

	if (delegate.committeeId) {
		const [committee] = await db.select().from(committees).where(eq(committees.id, delegate.committeeId));
		if (committee) throw redirect(302, `/committee/${committee.slug}`);
	}

	return {};
};
