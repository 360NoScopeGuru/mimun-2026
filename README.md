# MIMUN 2026 Platform

An in-house, invite-only platform for committee sessions: live committee chat, the speaker's list, and chair controls — no third-party chat/video tools required.

## Stack

- SvelteKit + TypeScript
- Tailwind CSS v4
- Postgres + Drizzle ORM
- Polling-based live updates (chat, speaker queue, status) — chosen to run cleanly on serverless hosting (Vercel); swappable for SSE/WebSockets if we move to a persistent host
- Invite-code based session auth (no public signup)

## Local development

1. Start Postgres and create a database, then set `DATABASE_URL` in `.env` (see `.env.example`).
2. Install dependencies:
   ```sh
   npm install
   ```
3. Push the schema to your database:
   ```sh
   npm run db:push
   ```
4. Seed a demo committee + delegates (prints invite codes to the console):
   ```sh
   npm run db:seed
   ```
5. Run the dev server:
   ```sh
   npm run dev
   ```
6. Visit `/login` and sign in with one of the invite codes printed by the seed script.

## How access works

There is no public signup. The secretariat pre-seeds the delegate roster (name, country, committee, role) with a unique invite code per person. Delegates log in with that code alone; chairs and admins use the same flow with elevated roles (`chair`, `admin`) that unlock chair controls and committee status changes.

## Current scope

Implemented: invite-only login, a single committee room with live chat, the speaker's list (join/leave/call next), and chair controls (open/suspend/close session).

Not yet built: voting/motions, resolution drafting, multi-committee admin dashboard, bulk roster import, position paper uploads.
