import { fail } from '@sveltejs/kit';
import { eq, inArray } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	conferences,
	committees,
	committeeFloor,
	delegates,
	attendance,
	messages,
	speakerQueue,
	motions,
	points,
	votes,
	ballots,
	resolutions,
	resolutionClauses,
	resolutionSponsors,
	amendments,
	notes,
	crisisUpdates,
	auditLog,
	files,
	sessions
} from '$lib/server/db/schema';
import { assertConferenceStaff } from '$lib/server/auth/guards';
import { makeInviteCode } from '$lib/server/invite';

const STANDINS = ['France', 'Kenya', 'Brazil', 'Japan'];

export const load: PageServerLoad = async ({ locals }) => {
	assertConferenceStaff(locals.delegate);
	const comms = await db
		.select({ id: committees.id, name: committees.name, slug: committees.slug, rulesConfig: committees.rulesConfig })
		.from(committees);
	const rooms = comms.filter((c) => (c.rulesConfig as { practice?: boolean } | null)?.practice);
	const people = rooms.length
		? await db
				.select({ committeeId: delegates.committeeId, fullName: delegates.fullName, country: delegates.country, role: delegates.role, inviteCode: delegates.inviteCode })
				.from(delegates)
				.where(inArray(delegates.committeeId, rooms.map((r) => r.id)))
		: [];
	return {
		rooms: rooms.map((r) => ({ id: r.id, name: r.name, slug: r.slug, people: people.filter((p) => p.committeeId === r.id) }))
	};
};

export const actions: Actions = {
	create: async ({ locals }) => {
		assertConferenceStaff(locals.delegate);
		const [conf] = await db.select({ id: conferences.id }).from(conferences).limit(1);
		if (!conf) return fail(400, { message: 'Create a conference first.' });

		const [committee] = await db
			.insert(committees)
			.values({
				conferenceId: conf.id,
				name: `Practice Room · ${new Date().toLocaleString()}`,
				slug: `practice-${Date.now()}`,
				topic: 'Practice — anything goes, nothing counts',
				rulesConfig: { preset: 'THIMUN', practice: true },
				status: 'in_session'
			})
			.returning({ id: committees.id });
		await db.insert(committeeFloor).values({ committeeId: committee.id, mode: 'formal_debate' });

		const rows = [
			{ fullName: 'Practice Chair', country: '', role: 'chair' as const },
			...STANDINS.map((country) => ({ fullName: `${country} (stand-in)`, country, role: 'delegate' as const }))
		].map((d) => ({ committeeId: committee.id, fullName: d.fullName, country: d.country, role: d.role, inviteCode: makeInviteCode(d.country, d.role), active: 1 }));
		const inserted = await db.insert(delegates).values(rows).returning({ id: delegates.id, role: delegates.role });
		await db.insert(attendance).values(
			inserted.filter((d) => d.role === 'delegate').map((d) => ({ committeeId: committee.id, delegateId: d.id, status: 'present_and_voting' as const }))
		);
		return { success: true };
	},

	remove: async ({ request, locals }) => {
		assertConferenceStaff(locals.delegate);
		const committeeId = String((await request.formData()).get('committeeId') ?? '');
		const [c] = await db.select({ id: committees.id, rulesConfig: committees.rulesConfig }).from(committees).where(eq(committees.id, committeeId));
		if (!c || !(c.rulesConfig as { practice?: boolean } | null)?.practice) return fail(400, { message: 'Not a practice room.' });

		const resIds = db.select({ id: resolutions.id }).from(resolutions).where(eq(resolutions.committeeId, committeeId));
		const voteIds = db.select({ id: votes.id }).from(votes).where(eq(votes.committeeId, committeeId));

		// Delete children before parents (no FK cascades in the schema).
		await db.transaction(async (tx) => {
			await tx.delete(ballots).where(inArray(ballots.voteId, voteIds));
			await tx.delete(votes).where(eq(votes.committeeId, committeeId));
			await tx.delete(amendments).where(inArray(amendments.resolutionId, resIds));
			await tx.delete(resolutionSponsors).where(inArray(resolutionSponsors.resolutionId, resIds));
			await tx.delete(resolutionClauses).where(inArray(resolutionClauses.resolutionId, resIds));
			await tx.delete(resolutions).where(eq(resolutions.committeeId, committeeId));
			await tx.delete(messages).where(eq(messages.committeeId, committeeId));
			await tx.delete(speakerQueue).where(eq(speakerQueue.committeeId, committeeId));
			await tx.delete(motions).where(eq(motions.committeeId, committeeId));
			await tx.delete(points).where(eq(points.committeeId, committeeId));
			await tx.delete(notes).where(eq(notes.committeeId, committeeId));
			await tx.delete(crisisUpdates).where(eq(crisisUpdates.committeeId, committeeId));
			await tx.delete(files).where(eq(files.committeeId, committeeId));
			await tx.delete(auditLog).where(eq(auditLog.committeeId, committeeId));
			await tx.delete(attendance).where(eq(attendance.committeeId, committeeId));
			await tx.delete(committeeFloor).where(eq(committeeFloor.committeeId, committeeId));
			// the stand-ins / chair may have logged in → clear their sessions first
			await tx.delete(sessions).where(inArray(sessions.delegateId, db.select({ id: delegates.id }).from(delegates).where(eq(delegates.committeeId, committeeId))));
			await tx.delete(delegates).where(eq(delegates.committeeId, committeeId));
			await tx.delete(committees).where(eq(committees.id, committeeId));
		});
		return { success: true };
	}
};
