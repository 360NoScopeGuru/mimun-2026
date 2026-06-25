/**
 * Pure fixed-window rate-limit arithmetic — no DB, no `$env` — so it's unit
 * tested in plain Vitest. The DB layer (`rateLimit.ts`) performs the exact same
 * window/count computation atomically via an upsert; this is the canonical
 * mirror of that logic. Mirrors the pure/impure split used by `ai-core.ts`.
 */

export type RateRule = {
	/** Max requests permitted per window. */
	limit: number;
	/** Window length in milliseconds. */
	windowMs: number;
};

export type RateDecision = {
	allowed: boolean;
	/** Requests left in the current window (0 once blocked). */
	remaining: number;
	/** Milliseconds until the current window rolls over. */
	resetMs: number;
	/** This request's position in the window (1-based). */
	count: number;
};

/** Epoch-ms start of the fixed window containing `nowMs`. */
export function windowStart(nowMs: number, windowMs: number): number {
	return Math.floor(nowMs / windowMs) * windowMs;
}

/**
 * Decide whether the request at `nowMs` is within budget, given the previously
 * stored window+count for its key (or null if unseen). A request in a new window
 * resets the count to 1; within the same window it increments. The request is
 * always counted, so sustained hammering keeps the key blocked for the window.
 */
export function decide(
	prev: { windowStart: number; count: number } | null,
	nowMs: number,
	rule: RateRule
): RateDecision & { windowStart: number } {
	const ws = windowStart(nowMs, rule.windowMs);
	const base = prev && prev.windowStart === ws ? prev.count : 0;
	const count = base + 1;
	return {
		windowStart: ws,
		count,
		allowed: count <= rule.limit,
		remaining: Math.max(0, rule.limit - count),
		resetMs: ws + rule.windowMs - nowMs
	};
}
