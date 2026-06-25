# MIMUN 2026 — Operations Runbook

Everything the secretariat needs to run the platform during a live conference, plus
the recovery procedures for when something goes wrong.

## Stack at a glance

- **App:** SvelteKit (Svelte 5), deployed on **Vercel** (push to `main` → auto build + deploy).
- **Database:** **Neon** Postgres. Use the **pooled** connection for the running app
  (`DATABASE_URL`), and the **direct** connection for `db:push` / `db:migrate` / `db:seed`.
- **Live updates:** 1-second polling against `/committee/[slug]/state`. The room backs off
  and shows "Reconnecting…" if the server is unreachable, then resyncs on recovery.
- **Auth:** invite codes (oslo session tokens, 14-day cookie). Deactivating a delegate
  revokes their session on the next request.

## Pre-event checklist

- [ ] Vercel env vars set: `DATABASE_URL` (pooled), and the AI keys
      (`OPENROUTER_API_KEY`, `NVIDIA_NIM_API_KEY`, `OPENROUTER_MODEL`, `NVIDIA_NIM_MODEL`,
      `AI_PROVIDER_ORDER`). AI features degrade gracefully if absent.
- [ ] Prod Neon has the full schema, the `rate_limits` table, and the hot-query indexes.
- [ ] Roster imported per committee (`/admin/roster`), invite cards printed (`/admin/print`).
- [ ] `GET /healthz` returns `{ ok: true, db: "up" }`.
- [ ] Smoke test: log in as a chair and a delegate, run roll call → speak → vote.
- [ ] Confirm Neon backup/PITR retention (see Backups).

## Roles & access

- **Delegate** — invite code `UN-XXXX`; sets own attendance, speaks, votes, drafts.
- **Chair / deputy chair** — code `CH-XXXX`; runs the floor, approval panel, console.
- **Secretariat / admin** — staff; the `/admin` console (desktop/tablet only).

Issue, regenerate, reassign, or deactivate delegates from **`/admin/delegates`**.

## Common event-day fixes

**A delegate can't log in.**
1. `/admin/delegates` → find them → confirm **active**.
2. If the code was lost/leaked, **Regenerate code** and re-issue.
3. Deactivated by mistake? Re-activate — they can log straight back in.

**A delegate is in the wrong committee.** `/admin/delegates` → **Reassign**. Their
session stays valid; they'll see the new committee on next load.

**Remove someone immediately.** `/admin/delegates` → **Deactivate**. Their live session
is revoked on their next request (no 14-day wait).

**Quorum looks wrong.** Chair → **Take roll call**; delegations re-declare present /
present-and-voting. Quorum + majority thresholds derive from attendance.

**A vote went out wrong / needs redoing.** There's no "reopen" by design (closed tallies
are final for integrity). The chair simply **opens a new vote** with the same question;
the new tally supersedes. The old one remains in the record + `audit_log`.

**Caucus/timer stuck.** Chair → **End caucus** (or **Recognize next speaker**). Timers are
server-authoritative `endsAt` timestamps; clients only count down locally.

**Everyone says the room is frozen.** Check `GET /healthz`. If `db: "down"`, it's Neon —
see Database below. The room auto-reconnects with backoff; a hard refresh forces a resync.

**"Panic" controls.** Chair: **Suspend** or **Close** the session (top of the console).
Secretariat: deactivate a disruptive delegate. Both are audited.

## Database (Neon)

- **Health:** `GET /healthz` pings the DB and reports latency.
- **Connections:** the app pool is `max: 10` per instance over Neon's pooled (PgBouncer)
  endpoint, which multiplexes thousands of clients. If you see connection saturation under
  extreme load, raise the pool in `src/lib/server/db/index.ts` and/or check Neon limits.
- **Backups / restore:** Neon keeps automatic backups with point-in-time restore. **Verify
  the retention window before the event.** To restore, use the Neon console (branch/restore
  to a timestamp). For a manual export: `pg_dump "<DIRECT_URL>" > backup.sql` (direct, not
  pooled).

## Schema changes & migrations

Versioned migrations live in `drizzle/`. The committed `0000_baseline.sql` is a snapshot of
the **current live schema**.

> ⚠️ The live Neon is already at the baseline (it was built with `db:push`). Do **not** run
> `db:migrate` against it until the baseline is marked **applied** (insert its entry into the
> `drizzle.__drizzle_migrations` journal) — otherwise it will try to `CREATE TABLE` tables
> that already exist. A fresh database can run `db:migrate` from scratch normally.

Going forward, for any schema change:
1. Edit `src/lib/server/db/schema.ts`.
2. `npm run db:generate` (writes a new `drizzle/NNNN_*.sql`).
3. **Review the SQL** — especially drops/renames.
4. Apply with `npm run db:migrate` against the **direct** connection (after baselining).

Additive, low-risk DDL during an event (e.g., a new index) can still be applied directly via
a small `node --env-file=.env` script, as has been done before.

## Observability

- **Logs:** structured JSON lines in the Vercel function logs (`lib/server/log.ts`).
- **Uncaught errors:** `hooks.server.ts` `handleError` logs every 5xx with route/method/user
  and shows the user the Chamber-styled `+error.svelte`. Hook an error tracker (Sentry, etc.)
  into `log.ts`'s `reportError` when a DSN is available — nothing else changes.
- **Rate limits:** per-delegate AI budgets + per-IP login throttle. The limiter **fails open**
  (never locks delegates out) and logs when it does.

## Deploy & rollback

- **Deploy:** push to `main`; Vercel builds and deploys automatically.
- **Rollback:** in the Vercel dashboard, promote the previous deployment ("Redeploy"). The DB
  is unaffected — only do a DB restore if a migration caused the problem.

## Quick reference

| Need | Where |
|------|-------|
| Health check | `GET /healthz` |
| Manage delegates / codes | `/admin/delegates` |
| Roster import | `/admin/roster` |
| Invite cards (print) | `/admin/print` |
| Live committee status | `/admin` dashboard |
| Spectator (sanitized) feed | `/watch/[slug]` |
| Projection (big screen) | `/committee/[slug]/projection` |
