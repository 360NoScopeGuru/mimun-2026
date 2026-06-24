import { db } from './db';
import { auditLog, type committees } from './db/schema';

type Committee = typeof committees.$inferSelect;

/** Record a floor action (especially chair overrides) for integrity. */
export async function audit(
	committee: Committee,
	actorId: string,
	action: string,
	detail: Record<string, unknown> = {}
) {
	await db.insert(auditLog).values({
		conferenceId: committee.conferenceId,
		committeeId: committee.id,
		actorId,
		action,
		detail
	});
}
