import { and, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { conferences, committees, delegates, attendance, committeeFloor, resolutions } from './db/schema';
import { presetFor, quorumThreshold, hasQuorum } from './procedure';

/**
 * Conference → committee summaries for the secretariat dashboard: live status,
 * floor mode, quorum, delegate count, and the resolution on the floor.
 */
export async function getConferenceOverview() {
	const [confs, comms, floors, delCounts, attCounts, onFloor] = await Promise.all([
		db.select({ id: conferences.id, name: conferences.name, slug: conferences.slug }).from(conferences),
		db.select({ id: committees.id, name: committees.name, slug: committees.slug, topic: committees.topic, status: committees.status, conferenceId: committees.conferenceId, rulesConfig: committees.rulesConfig }).from(committees),
		db.select({ committeeId: committeeFloor.committeeId, mode: committeeFloor.mode }).from(committeeFloor),
		db
			.select({ committeeId: delegates.committeeId, c: sql<number>`count(*)`.mapWith(Number) })
			.from(delegates)
			.where(and(eq(delegates.role, 'delegate'), eq(delegates.active, 1)))
			.groupBy(delegates.committeeId),
		db
			.select({ committeeId: attendance.committeeId, status: attendance.status, c: sql<number>`count(*)`.mapWith(Number) })
			.from(attendance)
			.innerJoin(delegates, eq(attendance.delegateId, delegates.id))
			.where(eq(delegates.role, 'delegate'))
			.groupBy(attendance.committeeId, attendance.status),
		db.select({ committeeId: resolutions.committeeId, designation: resolutions.designation, title: resolutions.title }).from(resolutions).where(eq(resolutions.status, 'on_floor'))
	]);

	const floorBy = new Map(floors.map((f) => [f.committeeId, f.mode]));
	const delBy = new Map(delCounts.map((d) => [d.committeeId, d.c]));
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
				return {
					id: c.id,
					name: c.name,
					slug: c.slug,
					topic: c.topic,
					status: c.status,
					mode: floorBy.get(c.id) ?? 'closed',
					delegates: total,
					present,
					voting: votingBy.get(c.id) ?? 0,
					quorumThreshold: quorumThreshold(total, preset.quorumFraction),
					hasQuorum: hasQuorum(present, total, preset.quorumFraction),
					resolution: onFloorBy.get(c.id) ?? null
				};
			})
	}));
}

export type ConferenceOverview = Awaited<ReturnType<typeof getConferenceOverview>>;
