// Structured server logging — JSON lines to stdout/stderr with context, so logs
// are greppable in Vercel and ready to ship to a drain or error tracker later.
// Zero dependencies and no third-party account: when a Sentry (or similar) DSN
// exists, wire it into `reportError` below — nothing else needs to change.

type Level = 'info' | 'warn' | 'error';
type Ctx = Record<string, unknown>;

function serializeError(err: unknown): Ctx {
	if (err instanceof Error) return { error: err.message, stack: err.stack };
	if (err !== undefined) return { error: String(err) };
	return {};
}

function emit(level: Level, msg: string, ctx?: Ctx, err?: unknown) {
	const record = { t: new Date().toISOString(), level, msg, ...ctx, ...serializeError(err) };
	const line = JSON.stringify(record);
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
}

/** Hook point for an external error tracker. No-op until a DSN is configured. */
function reportError(_msg: string, _ctx?: Ctx, _err?: unknown) {
	// e.g. Sentry.captureException(_err, { extra: { ..._ctx, msg: _msg } });
}

export const log = {
	info: (msg: string, ctx?: Ctx) => emit('info', msg, ctx),
	warn: (msg: string, ctx?: Ctx, err?: unknown) => emit('warn', msg, ctx, err),
	error: (msg: string, ctx?: Ctx, err?: unknown) => {
		emit('error', msg, ctx, err);
		reportError(msg, ctx, err);
	}
};
