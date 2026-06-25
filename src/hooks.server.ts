import type { Handle } from '@sveltejs/kit';
import { getSessionToken, validateSessionToken, setSessionCookie, deleteSessionCookie } from '$lib/server/auth';

/**
 * Conservative hardening headers applied to every response. Deliberately NOT a
 * restrictive script/style CSP (that risks breaking the Chamber/Paper styling
 * and Fontsource at event time) — only `frame-ancestors` for clickjacking, plus
 * the safe, universally-applicable headers.
 */
function applySecurityHeaders(headers: Headers) {
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	headers.set('X-Frame-Options', 'SAMEORIGIN');
	headers.set('Content-Security-Policy', "frame-ancestors 'self'");
	headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');
	// Vercel serves the app over HTTPS only; lock it in for a year.
	headers.set('Strict-Transport-Security', 'max-age=31536000');
}

export const handle: Handle = async ({ event, resolve }) => {
	const token = getSessionToken(event);

	if (!token) {
		event.locals.delegate = null;
	} else {
		const { session, delegate } = await validateSessionToken(token);

		if (session && delegate) {
			setSessionCookie(event, token, session.expiresAt);
			event.locals.delegate = delegate;
		} else {
			deleteSessionCookie(event);
			event.locals.delegate = null;
		}
	}

	const response = await resolve(event);
	applySecurityHeaders(response.headers);
	return response;
};
