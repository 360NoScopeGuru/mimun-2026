import { and, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { committees, committeeFloor, delegates, attendance, votes, ballots, motions, resolutions } from './db/schema';
import { presetFor, hasQuorum, type BallotChoice } from './procedure';

type Committee = typeof committees.$inferSelect;

const MOTION_LABELS: Record<string, string> = {
	moderated_caucus: 'Moderated caucus',
	unmoderated_caucus: 'Unmoderated caucus',
	extend_debate: 'Extend debate',
	introduce_resolution: 'Introduce resolution',
	move_to_voting: 'Move to voting procedure',
	adjourn_debate: 'Adjourn debate',
	suspend_session: 'Suspend session',
	close_debate: 'Close debate'
};

export type SpectatorState = {
	name: string;
	topic: string;
	status: Committee['status'];
	mode: string;
	currentSpeaker: { name: string; country: string } | null;
	caucusTimerEndsAt: string | Date | null;
	caucusTopic: string | null;
	motionLabel: string | null;
	vote: { label: string; for: number; against: number; abstain: number } | null;
	resolution: { designation: string; title: string } | null;
	quorum: { present: number; total: number; hasQuorum: boolean };
};

/**
 * PUBLIC, sanitized snapshot of a committee for the no-login spectator feed.
 * Deliberately re-implements its own narrow queries (rather than reusing
 * getCommitteeState) so it can NEVER leak sensitive data: no chat, no notes,
 * no per-delegate ballots, no invite codes, and no roster beyond the current
 * speaker's name/country.
 */
export async function getSpectatorState(committee: Committee): Promise<SpectatorState> {
	const preset = presetFor((committee.rulesConfig as { preset?: string })?.preset);

	const [floorRows, roster, attendanceRows, openVoteRows, floorResolutionRows] = await Promise.all([
		db.select().from(committeeFloor).where(eq(committeeFloor.committeeId, committee.id)),
		db.select({ role: delegates.role }).from(delegates).where(and(eq(delegates.committeeId, committee.id), eq(delegates.active, 1))),
		db
			.select({ status: attendance.status, role: delegates.role })
			.from(attendance)
			.innerJoin(delegates, eq(attendance.delegateId, delegates.id))
			.where(eq(attendance.committeeId, committee.id)),
		db
			.select({ id: votes.id, label: votes.label, subjectType: votes.subjectType, subjectId: votes.subjectId })
			.from(votes)
			.where(and(eq(votes.committeeId, committee.id), eq(votes.status, 'open')))
			.orderBy(desc(votes.opensAt))
			.limit(1),
		db
			.select({ designation: resolutions.designation, title: resolutions.title })
			.from(resolutions)
			.where(and(eq(resolutions.committeeId, committee.id), eq(resolutions.status, 'on_floor')))
			.orderBy(desc(resolutions.introducedAt))
			.limit(1)
	]);

	const floorRow = floorRows[0];

	let currentSpeaker: { name: string; country: string } | null = null;
	if (floorRow?.currentSpeakerId) {
		const [s] = await db.select({ name: delegates.fullName, country: delegates.country }).from(delegates).where(eq(delegates.id, floorRow.currentSpeakerId));
		currentSpeaker = s ?? null;
	}

	const total = roster.filter((r) => r.role === 'delegate').length;
	const present = attendanceRows.filter((a) => a.role === 'delegate' && a.status !== 'absent').length;

	let vote: SpectatorState['vote'] = null;
	let motionLabel: string | null = null;
	if (openVoteRows[0]) {
		const v = openVoteRows[0];
		const cast = await db.select({ delegateId: ballots.delegateId, choice: ballots.choice, round: ballots.round }).from(ballots).where(eq(ballots.voteId, v.id));
		const latest = new Map<string, BallotChoice>();
		for (const b of [...cast].sort((a, b) => a.round - b.round)) latest.set(b.delegateId, b.choice as BallotChoice);

		let forC = 0;
		let againstC = 0;
		let abstainC = 0;
		for (const c of latest.values()) {
			if (c === 'for') forC += 1;
			else if (c === 'against') againstC += 1;
			else if (c === 'abstain') abstainC += 1;
		}

		let label = v.label;
		if (!label && v.subjectType === 'motion' && v.subjectId) {
			const [m] = await db.select({ type: motions.type }).from(motions).where(eq(motions.id, v.subjectId));
			if (m) label = MOTION_LABELS[m.type] ?? 'Motion';
		}
		if (!label) label = 'Vote';

		vote = { label, for: forC, against: againstC, abstain: abstainC };
		motionLabel = label;
	}

	return {
		name: committee.name,
		topic: committee.topic,
		status: committee.status,
		mode: floorRow?.mode ?? 'closed',
		currentSpeaker,
		caucusTimerEndsAt: floorRow?.caucusTimerEndsAt ?? null,
		caucusTopic: floorRow?.caucusTopic ?? null,
		motionLabel,
		vote,
		resolution: floorResolutionRows[0] ? { designation: floorResolutionRows[0].designation ?? '', title: floorResolutionRows[0].title } : null,
		quorum: { present, total, hasQuorum: hasQuorum(present, total, preset.quorumFraction) }
	};
}
