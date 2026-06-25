import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

/**
 * Unauthenticated liveness/readiness probe for uptime monitoring and the
 * event-day runbook. Pings Postgres so a 200 means "app + DB reachable".
 * Returns 503 if the DB round-trip fails, so monitors can alert.
 */
export const GET: RequestHandler = async () => {
	const started = Date.now();
	try {
		await db.execute(sql`select 1`);
		return json({
			ok: true,
			db: 'up',
			latencyMs: Date.now() - started,
			ts: new Date().toISOString()
		});
	} catch (err) {
		console.error('healthz: db check failed', err);
		return json({ ok: false, db: 'down', ts: new Date().toISOString() }, { status: 503 });
	}
};
