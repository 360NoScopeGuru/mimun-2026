import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { conferences, committees, delegates, attendance, committeeFloor, resolutions } from './db/schema';
import { presetFor, quorumThreshold, hasQuorum } from './procedure';

/**
 * Conference → committee summaries for the secretariat dashboard: live status,
 * floor mode, quorum, delegate count, the resolution on the floor, and a
 * `problems[]` list so the console can flag rooms that need attention (rather
 * than leaving the secretariat to eyeball a flat list).
 */
export async function getConferenceOverview() {
	const [confs, comms, floors, delCounts, chairCounts, attCounts, onFloor] = await Promise.all([
		db.select({ id: conferences.id, name: conferences.name, slug: conferences.slug }).from(conferences),
		db.select({ id: committees.id, name: committees.name, slug: committees.slug, topic: committees.topic, status: committees.status, conferenceId: committees.conferenceId, rulesConfig: committees.rulesConfig }).from(committees),
		db.select({ committeeId: committeeFloor.committeeId, mode: committeeFloor.mode, currentSpeakerId: committeeFloor.currentSpeakerId }).from(committeeFloor),
		db
			.select({ committeeId: delegates.committeeId, c: sql<number>`count(*)`.mapWith(Number) })
			.from(delegates)
			.where(and(eq(delegates.role, 'delegate'), eq(delegates.active, 1)))
			.groupBy(delegates.committeeId),
		db
			.select({ committeeId: delegates.committeeId, c: sql<number>`count(*)`.mapWith(Number) })
			.from(delegates)
			.where(and(inArray(delegates.role, ['chair', 'deputy_chair']), eq(delegates.active, 1)))
			.groupBy(delegates.committeeId),
		db
			.select({ committeeId: attendance.committeeId, status: attendance.status, c: sql<number>`count(*)`.mapWith(Number) })
			.from(attendance)
			.innerJoin(delegates, eq(attendance.delegateId, delegates.id))
			.where(eq(delegates.role, 'delegate'))
			.groupBy(attendance.committeeId, attendance.status),
		db.select({ committeeId: resolutions.committeeId, designation: resolutions.designation, title: resolutions.title }).from(resolutions).where(eq(resolutions.status, 'on_floor'))
	]);

	const floorBy = new Map(floors.map((f) => [f.committeeId, f]));
	const delBy = new Map(delCounts.map((d) => [d.committeeId, d.c]));
	const chairBy = new Map(chairCounts.map((d) => [d.committeeId, d.c]));
	const onFloorBy = new Map(onFloor.map((r) => [r.committeeId, r]));
	const presentBy = new Map<string, number>();
	const votingBy = new Map<string, number>();
	for (const a of attCounts) {
		if (a.status !== 'absent') presentBy.set(a.committeeId, (presentBy.get(a.committeeId) ?? 0) + a.c);
		if (a.status === 'present_and_voting') votingBy.set(a.committeeId, (votingBy.get(a.committeeId) ?? 0) + a.c);
	}

	return confs.map((conf) => ({
		...conf,
		committees: comms
			.filter((c) => c.conferenceId === conf.id)
			.map((c) => {
				const preset = presetFor((c.rulesConfig as { preset?: string })?.preset);
				const total = delBy.get(c.id) ?? 0;
				const present = presentBy.get(c.id) ?? 0;
				const floor = floorBy.get(c.id);
				const mode = floor?.mode ?? 'closed';
				const quorumOk = hasQuorum(present, total, preset.quorumFraction);
				const hasChair = (chairBy.get(c.id) ?? 0) > 0;

				// Exception flags — readiness gaps + live trouble, in one list.
				const problems: string[] = [];
				if (!hasChair) problems.push('No chair assigned');
				if (total === 0) problems.push('No delegates');
				if (c.status === 'in_session' && mode === 'closed') problems.push('In session but floor is closed');
				if (c.status === 'in_session' && total > 0 && !quorumOk) problems.push('Quorum not met');
				if (mode === 'formal_debate' && !floor?.currentSpeakerId) problems.push('No speaker recognized');

				return {
					id: c.id,
					name: c.name,
					slug: c.slug,
					topic: c.topic,
					status: c.status,
					mode,
					delegates: total,
					present,
					voting: votingBy.get(c.id) ?? 0,
					quorumThreshold: quorumThreshold(total, preset.quorumFraction),
					hasQuorum: quorumOk,
					resolution: onFloorBy.get(c.id) ?? null,
					hasChair,
					problems
				};
			})
	}));
}

export type ConferenceOverview = Awaited<ReturnType<typeof getConferenceOverview>>;
