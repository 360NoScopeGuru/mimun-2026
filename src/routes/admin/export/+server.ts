import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	conferences,
	committees,
	delegates,
	attendance,
	motions,
	points,
	votes,
	ballots,
	resolutions,
	resolutionClauses,
	resolutionSponsors,
	amendments,
	auditLog
} from '$lib/server/db/schema';
import { assertConferenceStaff } from '$lib/server/auth/guards';

// Data portability for licensees: the full official procedural record as a JSON
// bundle. Deliberately EXCLUDES sensitive material — invite codes, private notes,
// session tokens, and uploaded file blobs are not part of the export.
export const GET: RequestHandler = async ({ locals }) => {
	assertConferenceStaff(locals.delegate);

	const delegateCols = {
		id: delegates.id,
		fullName: delegates.fullName,
		country: delegates.country,
		role: delegates.role,
		committeeId: delegates.committeeId,
		active: delegates.active
	};

	const [conf, comm, dels, att, mots, pts, vts, blts, res, clauses, sponsors, amends, audit] = await Promise.all([
		db.select().from(conferences),
		db.select().from(committees),
		db.select(delegateCols).from(delegates),
		db.select().from(attendance),
		db.select().from(motions),
		db.select().from(points),
		db.select().from(votes),
		db.select().from(ballots),
		db.select().from(resolutions),
		db.select().from(resolutionClauses),
		db.select().from(resolutionSponsors),
		db.select().from(amendments),
		db.select().from(auditLog)
	]);

	const bundle = {
		exportedAt: new Date().toISOString(),
		conferences: conf,
		committees: comm,
		delegates: dels,
		attendance: att,
		motions: mots,
		points: pts,
		votes: vts,
		ballots: blts,
		resolutions: res,
		resolutionClauses: clauses,
		resolutionSponsors: sponsors,
		amendments: amends,
		auditLog: audit
	};

	return new Response(JSON.stringify(bundle, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="mimun-export-${new Date().toISOString().slice(0, 10)}.json"`
		}
	});
};
