import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { authenticateInviteCode, createSession, generateSessionToken, setSessionCookie } from '$lib/server/auth';
import { rateLimit, RATE_RULES, retryAfterSeconds } from '$lib/server/rateLimit';
import { db } from '$lib/server/db';
import { committees } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.delegate) throw redirect(302, '/');
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const inviteCode = String(form.get('inviteCode') ?? '');

		if (!inviteCode.trim()) {
			return fail(400, { message: 'Enter your invite code.' });
		}

		// Throttle invite-code guessing per client IP.
		const rl = await rateLimit(`login:${event.getClientAddress()}`, RATE_RULES.login);
		if (!rl.allowed) {
			return fail(429, { message: `Too many sign-in attempts. Try again in ${retryAfterSeconds(rl)}s.` });
		}

		const delegate = await authenticateInviteCode(inviteCode);

		if (!delegate) {
			return fail(400, { message: 'That invite code is not recognized. Check it and try again.' });
		}

		const token = generateSessionToken();
		const session = await createSession(token, delegate.id);
		setSessionCookie(event, token, session.expiresAt);

		// Secretariat / admin land in the admin console.
		if (delegate.role === 'admin' || delegate.role === 'secretariat') throw redirect(302, '/admin');

		if (delegate.committeeId) {
			const [committee] = await db.select().from(committees).where(eq(committees.id, delegate.committeeId));
			if (committee) throw redirect(302, `/committee/${committee.slug}`);
		}

		throw redirect(302, '/');
	}
};
