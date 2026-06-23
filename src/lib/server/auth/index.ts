import { eq } from 'drizzle-orm';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase64url, encodeHexLowerCase } from '@oslojs/encoding';
import type { RequestEvent } from '@sveltejs/kit';
import { db } from '../db';
import { sessions, delegates } from '../db/schema';

const SESSION_COOKIE = 'mimun_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export function generateSessionToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(20));
	return encodeBase64url(bytes);
}

function hashToken(token: string): string {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

export async function createSession(token: string, delegateId: string) {
	const sessionId = hashToken(token);
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
	await db.insert(sessions).values({ id: sessionId, delegateId, expiresAt });
	return { id: sessionId, delegateId, expiresAt };
}

export async function validateSessionToken(token: string) {
	const sessionId = hashToken(token);
	const [result] = await db
		.select({ delegate: delegates, session: sessions })
		.from(sessions)
		.innerJoin(delegates, eq(sessions.delegateId, delegates.id))
		.where(eq(sessions.id, sessionId));

	if (!result) return { session: null, delegate: null };

	if (Date.now() >= result.session.expiresAt.getTime()) {
		await db.delete(sessions).where(eq(sessions.id, sessionId));
		return { session: null, delegate: null };
	}

	return result;
}

export async function invalidateSession(sessionId: string) {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function setSessionCookie(event: RequestEvent, token: string, expiresAt: Date) {
	event.cookies.set(SESSION_COOKIE, token, {
		expires: expiresAt,
		path: '/',
		httpOnly: true,
		secure: !import.meta.env.DEV,
		sameSite: 'lax'
	});
}

export function deleteSessionCookie(event: RequestEvent) {
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function getSessionToken(event: RequestEvent) {
	return event.cookies.get(SESSION_COOKIE) ?? null;
}

export async function authenticateInviteCode(inviteCode: string) {
	const [delegate] = await db
		.select()
		.from(delegates)
		.where(eq(delegates.inviteCode, inviteCode.trim().toUpperCase()));

	if (!delegate || delegate.active !== 1) return null;
	return delegate;
}
