/**
 * DB-backed fixed-window rate limiting. One row per limiter key in `rate_limits`,
 * upserted atomically so concurrent requests can't race past the limit. Backed
 * by Postgres (no Redis / extra infra) — fine at MIMUN's scale and survives the
 * serverless multi-instance deployment where in-memory counters wouldn't.
 *
 * Fails OPEN: if the limiter query errors, the request is allowed. A broken
 * limiter must never lock delegates out of the floor mid-session.
 */
import { error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from './db';
import { windowStart, type RateRule, type RateDecision } from './rateLimit-core';

export type { RateRule, RateDecision };

/** Named budgets. AI feedback is the most expensive (metered free tier) → tightest. */
export const RATE_RULES = {
	aiQa: { limit: 12, windowMs: 60_000 }, // parliamentarian Q&A
	aiReview: { limit: 6, windowMs: 60_000 }, // resolution / position-paper feedback
	aiSummary: { limit: 6, windowMs: 60_000 }, // chair session summary
	login: { limit: 10, windowMs: 60_000 }, // invite-code attempts, per IP
	note: { limit: 30, windowMs: 60_000 } // diplomatic notes, per delegate
} as const satisfies Record<string, RateRule>;

export async function rateLimit(key: string, rule: RateRule): Promise<RateDecision> {
	const now = Date.now();
	const ws = windowStart(now, rule.windowMs);
	try {
		// Atomic: insert a fresh window, or bump the count if we're still inside the
		// stored window, or reset to 1 if the stored window has rolled over.
		const rows = (await db.execute(sql`
			insert into rate_limits (key, window_start, count)
			values (${key}, ${ws}, 1)
			on conflict (key) do update set
				count = case when rate_limits.window_start = ${ws} then rate_limits.count + 1 else 1 end,
				window_start = ${ws}
			returning count
		`)) as unknown as { count: number | string }[];
		const count = Number(rows[0]?.count ?? 1);
		return {
			allowed: count <= rule.limit,
			remaining: Math.max(0, rule.limit - count),
			resetMs: ws + rule.windowMs - now,
			count
		};
	} catch (err) {
		console.error('rateLimit failed open for', key, err);
		return { allowed: true, remaining: rule.limit, resetMs: rule.windowMs, count: 0 };
	}
}

/** Seconds until the window rolls over, for a friendly "try again in Ns" message. */
export function retryAfterSeconds(d: RateDecision): number {
	return Math.max(1, Math.ceil(d.resetMs / 1000));
}

/**
 * Enforce a limit in a `+server` endpoint: throws a SvelteKit 429 (whose
 * `{ message }` the room's fetch handlers already surface) when over budget.
 */
export async function enforceRate(key: string, rule: RateRule, message: string): Promise<void> {
	const d = await rateLimit(key, rule);
	if (!d.allowed) error(429, `${message} (try again in ${retryAfterSeconds(d)}s)`);
}
