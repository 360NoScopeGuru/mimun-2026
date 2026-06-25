# MIMUN 2026 Platform

An in-house, invite-only platform for running a large, THIMUN-style Model UN —
live committee floors, full procedure, resolution drafting, and a secretariat
console — with no third-party chat/video tools required.

## Stack

- **SvelteKit + TypeScript** (Svelte 5 runes)
- **Tailwind CSS v4** — the "Chamber & Paper" design system in `src/routes/layout.css`
- **Postgres (Neon) + Drizzle ORM**
- **Vercel** hosting (push to `main` → auto deploy)
- **Polling-based live updates** — a consolidated `/committee/[slug]/state` snapshot on a
  1s poll with timestamp-based timers; resilient with backoff + reconnect. Swappable for
  SSE/WebSockets behind the same shape if we move to a persistent host.
- **Invite-code session auth** (oslo tokens; no public signup)
- **Optional AI** — parliamentarian Q&A, resolution / position-paper review, and session
  summaries via OpenRouter + NVIDIA NIM with ordered failover. Degrades gracefully if unset.

## Features

- **Live committee room** — chat, speaker's list, roll call + quorum, moderated/unmoderated
  caucuses with timers, a focused & touch-friendly dais with collapsible tools/console.
- **Full THIMUN procedure** — motions with precedence, points, procedural **and** substantive
  voting (placard + roll-call with second rounds), all tallied server-side from ballots.
- **Resolutions** — lobbying → merging → submission → dais approval panel → on-floor →
  vote → adopt; friendly/unfriendly amendments; co-submitters; designations.
- **Documents** — position-paper uploads, committee document hub, adopted-resolution archive.
- **Secretariat console** (`/admin`) — multi-committee dashboard, committee config, bulk CSV
  roster import, printable invite cards, delegate management, participation → awards, certificates.
- **Spectator feed** (`/watch`) — sanitized public view. **Projection** — big-screen mode with
  a live placard board and synthesized gavel/chime.
- Procedural integrity throughout: chair overrides are audited (`audit_log`); multi-step vote
  and amendment writes are transactional.

## Local development

1. Set `DATABASE_URL` in `.env` (see `.env.example`); a cloud Neon DB works well.
2. Install + push the schema + seed a demo committee (prints invite codes):
   ```sh
   npm install
   npm run db:push
   npm run db:seed
   npm run dev
   ```
3. Visit `/login` and sign in with a printed invite code.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` / `build` / `preview` | Vite dev / production build / preview |
| `npm run check` | `svelte-check` (types + a11y) |
| `npm test` | Vitest (pure procedure, voting, AI, rate-limit logic) |
| `npm run db:push` | Push schema to the DB (dev) |
| `npm run db:generate` / `db:migrate` | Versioned migrations (see the runbook) |
| `npm run db:seed` | Seed a demo conference + roster |

## How access works

No public signup. The secretariat pre-seeds the roster (name, country, committee, role) with a
unique invite code per person. Delegates log in with that code alone; chairs and secretariat use
the same flow with elevated roles that unlock the console. Deactivating a delegate revokes their
live session immediately.

## Architecture notes

- **Procedure engine** (`src/lib/server/procedure/`) — pure, unit-tested THIMUN preset:
  motion precedence, quorum/majority/tally math. DB-agnostic.
- **Live state** — `src/lib/server/committeeState.ts` → `/committee/[slug]/state`; the room and
  projection drive entirely off this poll.
- **Auth/guards** — `src/lib/server/auth/` (`loadCommittee`, `assertMember`, `assertChair`); every
  mutation is a guarded form action / `+server` POST, scoped by `committeeId`.
- **Observability** — structured JSON logs (`src/lib/server/log.ts`); a central `handleError`
  hook; `GET /healthz` DB probe.

## Operations

See **[docs/RUNBOOK.md](docs/RUNBOOK.md)** for the event-day checklist, common fixes, backups,
migrations, and rollback.
