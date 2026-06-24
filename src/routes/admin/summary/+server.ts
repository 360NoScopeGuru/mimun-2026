import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isStaff } from '$lib/server/auth/guards';
import { getConferenceOverview } from '$lib/server/admin';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.delegate || !isStaff(locals.delegate)) error(403);
	return Response.json({ overview: await getConferenceOverview() });
};
