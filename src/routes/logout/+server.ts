import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSessionToken, validateSessionToken, invalidateSession, deleteSessionCookie } from '$lib/server/auth';

export const POST: RequestHandler = async (event) => {
	const token = getSessionToken(event);
	if (token) {
		const { session } = await validateSessionToken(token);
		if (session) await invalidateSession(session.id);
	}
	deleteSessionCookie(event);
	throw redirect(302, '/login');
};
