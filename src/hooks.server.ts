import type { Handle } from '@sveltejs/kit';
import { getSessionToken, validateSessionToken, setSessionCookie, deleteSessionCookie } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const token = getSessionToken(event);

	if (!token) {
		event.locals.delegate = null;
		return resolve(event);
	}

	const { session, delegate } = await validateSessionToken(token);

	if (session && delegate) {
		setSessionCookie(event, token, session.expiresAt);
		event.locals.delegate = delegate;
	} else {
		deleteSessionCookie(event);
		event.locals.delegate = null;
	}

	return resolve(event);
};
