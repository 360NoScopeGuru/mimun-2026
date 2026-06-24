import { pgTable, text, timestamp, integer, uuid, jsonb, pgEnum, unique, customType } from 'drizzle-orm/pg-core';

// Raw binary column for storing uploaded files (position papers, committee docs).
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return 'bytea';
	}
});

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const delegateRole = pgEnum('delegate_role', ['delegate', 'chair', 'deputy_chair', 'admin', 'secretariat']);
export const committeeStatus = pgEnum('committee_status', ['pending', 'in_session', 'suspended', 'closed']);
export const queueStatus = pgEnum('queue_status', ['waiting', 'speaking', 'done', 'withdrawn']);

export const attendanceStatus = pgEnum('attendance_status', ['absent', 'present', 'present_and_voting']);

// The live procedural mode of a committee floor (finer-grained than committeeStatus).
export const floorMode = pgEnum('floor_mode', [
	'closed',
	'roll_call',
	'formal_debate',
	'moderated_caucus',
	'unmoderated_caucus',
	'voting'
]);

// THIMUN-leaning motion set; grows in Phase 2.
export const motionType = pgEnum('motion_type', [
	'moderated_caucus',
	'unmoderated_caucus',
	'extend_debate',
	'introduce_resolution',
	'move_to_voting',
	'adjourn_debate',
	'suspend_session',
	'close_debate'
]);
export const motionStatus = pgEnum('motion_status', ['proposed', 'seconded', 'voting', 'passed', 'failed', 'withdrawn', 'tabled']);

export const pointType = pgEnum('point_type', ['order', 'information', 'personal_privilege', 'parliamentary_inquiry']);

export const voteSubjectType = pgEnum('vote_subject_type', ['motion', 'amendment', 'resolution']);
export const voteKind = pgEnum('vote_kind', ['procedural', 'substantive']);
export const majorityRule = pgEnum('majority_rule', ['simple', 'two_thirds']);
export const voteMethod = pgEnum('vote_method', ['placard', 'roll_call']);
export const voteStatus = pgEnum('vote_status', ['open', 'closed']);
export const voteResult = pgEnum('vote_result', ['passed', 'failed']);
export const ballotChoice = pgEnum('ballot_choice', ['for', 'against', 'abstain', 'pass']);

export const resolutionStatus = pgEnum('resolution_status', [
	'lobbying',
	'submitted',
	'approved',
	'on_floor',
	'adopted',
	'failed',
	'withdrawn'
]);
export const clauseKind = pgEnum('clause_kind', ['preambulatory', 'operative']);
export const sponsorRole = pgEnum('sponsor_role', ['main_submitter', 'co_submitter', 'signatory']);
export const amendmentType = pgEnum('amendment_type', ['friendly', 'unfriendly']);
export const amendmentAction = pgEnum('amendment_action', ['add', 'amend', 'strike']);
export const amendmentStatus = pgEnum('amendment_status', ['proposed', 'accepted', 'voting', 'passed', 'failed', 'withdrawn']);

export const fileKind = pgEnum('file_kind', ['position_paper', 'background_guide', 'rop', 'agenda', 'study_guide', 'other']);

/* ------------------------------------------------------------------ *
 * Tenancy
 * ------------------------------------------------------------------ */

export const conferences = pgTable('conferences', {
	id: uuid('id').defaultRandom().primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	startsAt: timestamp('starts_at', { withTimezone: true }),
	endsAt: timestamp('ends_at', { withTimezone: true }),
	// procedure preset, branding, timezone, etc.
	settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const committees = pgTable('committees', {
	id: uuid('id').defaultRandom().primaryKey(),
	conferenceId: uuid('conference_id')
		.notNull()
		.references(() => conferences.id),
	name: text('name').notNull(),
	// Globally unique for now; relaxes to (conferenceId, slug) when nested routing lands (Phase 3).
	slug: text('slug').notNull().unique(),
	topic: text('topic').notNull().default(''),
	// Agenda issues debated by this committee.
	agenda: jsonb('agenda').$type<string[]>().notNull().default([]),
	// Per-committee rules: majorities, quorum rule, default speaking/caucus times.
	rulesConfig: jsonb('rules_config').$type<Record<string, unknown>>().notNull().default({}),
	status: committeeStatus('status').notNull().default('pending'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const delegates = pgTable('delegates', {
	id: uuid('id').defaultRandom().primaryKey(),
	fullName: text('full_name').notNull(),
	country: text('country').notNull().default(''),
	role: delegateRole('role').notNull().default('delegate'),
	committeeId: uuid('committee_id').references(() => committees.id),
	inviteCode: text('invite_code').notNull().unique(),
	active: integer('active').notNull().default(1),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable('sessions', {
	id: text('id').primaryKey(),
	delegateId: uuid('delegate_id')
		.notNull()
		.references(() => delegates.id),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

/* ------------------------------------------------------------------ *
 * Committee floor — live session
 * ------------------------------------------------------------------ */

export const messages = pgTable('messages', {
	id: uuid('id').defaultRandom().primaryKey(),
	committeeId: uuid('committee_id')
		.notNull()
		.references(() => committees.id),
	delegateId: uuid('delegate_id')
		.notNull()
		.references(() => delegates.id),
	body: text('body').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const speakerQueue = pgTable('speaker_queue', {
	id: uuid('id').defaultRandom().primaryKey(),
	committeeId: uuid('committee_id')
		.notNull()
		.references(() => committees.id),
	delegateId: uuid('delegate_id')
		.notNull()
		.references(() => delegates.id),
	status: queueStatus('status').notNull().default('waiting'),
	joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow()
});

// One attendance row per delegate per committee, reflecting the current session.
export const attendance = pgTable(
	'attendance',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		committeeId: uuid('committee_id')
			.notNull()
			.references(() => committees.id),
		delegateId: uuid('delegate_id')
			.notNull()
			.references(() => delegates.id),
		status: attendanceStatus('status').notNull().default('absent'),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique('attendance_committee_delegate_uq').on(t.committeeId, t.delegateId)]
);

// One row per committee: the authoritative "what is happening now" on the floor.
export const committeeFloor = pgTable('committee_floor', {
	committeeId: uuid('committee_id')
		.primaryKey()
		.references(() => committees.id),
	mode: floorMode('mode').notNull().default('closed'),
	activeMotionId: uuid('active_motion_id'),
	activeResolutionId: uuid('active_resolution_id'),
	currentSpeakerId: uuid('current_speaker_id').references(() => delegates.id),
	// Timestamp-based timers: clients count down to these locally.
	speakerTimerEndsAt: timestamp('speaker_timer_ends_at', { withTimezone: true }),
	caucusTimerEndsAt: timestamp('caucus_timer_ends_at', { withTimezone: true }),
	caucusTopic: text('caucus_topic'),
	debateSide: text('debate_side'), // 'for' | 'against' during formal debate
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

/* ------------------------------------------------------------------ *
 * Procedure
 * ------------------------------------------------------------------ */

export const motions = pgTable('motions', {
	id: uuid('id').defaultRandom().primaryKey(),
	committeeId: uuid('committee_id')
		.notNull()
		.references(() => committees.id),
	proposedById: uuid('proposed_by_id')
		.notNull()
		.references(() => delegates.id),
	type: motionType('type').notNull(),
	// totalSeconds, speakingSeconds, topic, targetResolutionId, extendSeconds, …
	params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
	status: motionStatus('status').notNull().default('proposed'),
	precedenceRank: integer('precedence_rank').notNull().default(0),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	decidedAt: timestamp('decided_at', { withTimezone: true })
});

export const points = pgTable('points', {
	id: uuid('id').defaultRandom().primaryKey(),
	committeeId: uuid('committee_id')
		.notNull()
		.references(() => committees.id),
	byId: uuid('by_id')
		.notNull()
		.references(() => delegates.id),
	type: pointType('type').notNull(),
	body: text('body').notNull().default(''),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	resolvedAt: timestamp('resolved_at', { withTimezone: true })
});

/* ------------------------------------------------------------------ *
 * Voting
 * ------------------------------------------------------------------ */

export const votes = pgTable('votes', {
	id: uuid('id').defaultRandom().primaryKey(),
	committeeId: uuid('committee_id')
		.notNull()
		.references(() => committees.id),
	subjectType: voteSubjectType('subject_type').notNull(),
	subjectId: uuid('subject_id'), // polymorphic → motions/amendments/resolutions
	// Human-readable question shown to delegates (e.g. "Motion for a 10-min moderated caucus").
	label: text('label').notNull().default(''),
	kind: voteKind('kind').notNull(),
	majorityRule: majorityRule('majority_rule').notNull().default('simple'),
	method: voteMethod('method').notNull().default('placard'),
	status: voteStatus('status').notNull().default('open'),
	result: voteResult('result'),
	round: integer('round').notNull().default(1),
	// Cached tallies (authoritative count is always recomputable from ballots).
	tallyFor: integer('tally_for').notNull().default(0),
	tallyAgainst: integer('tally_against').notNull().default(0),
	tallyAbstain: integer('tally_abstain').notNull().default(0),
	opensAt: timestamp('opens_at', { withTimezone: true }).notNull().defaultNow(),
	closesAt: timestamp('closes_at', { withTimezone: true })
});

export const ballots = pgTable(
	'ballots',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		voteId: uuid('vote_id')
			.notNull()
			.references(() => votes.id),
		delegateId: uuid('delegate_id')
			.notNull()
			.references(() => delegates.id),
		choice: ballotChoice('choice').notNull(),
		round: integer('round').notNull().default(1),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [unique('ballots_vote_delegate_round_uq').on(t.voteId, t.delegateId, t.round)]
);

/* ------------------------------------------------------------------ *
 * Resolutions & documents (THIMUN core)
 * ------------------------------------------------------------------ */

export const resolutions = pgTable('resolutions', {
	id: uuid('id').defaultRandom().primaryKey(),
	committeeId: uuid('committee_id')
		.notNull()
		.references(() => committees.id),
	agendaIssue: text('agenda_issue').notNull().default(''),
	title: text('title').notNull().default(''),
	mainSubmitterId: uuid('main_submitter_id').references(() => delegates.id),
	status: resolutionStatus('status').notNull().default('lobbying'),
	designation: text('designation'), // e.g. "1.1"
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	approvedAt: timestamp('approved_at', { withTimezone: true }),
	introducedAt: timestamp('introduced_at', { withTimezone: true })
});

export const resolutionClauses = pgTable('resolution_clauses', {
	id: uuid('id').defaultRandom().primaryKey(),
	resolutionId: uuid('resolution_id')
		.notNull()
		.references(() => resolutions.id),
	kind: clauseKind('kind').notNull(),
	position: integer('position').notNull().default(0),
	text: text('text').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const resolutionSponsors = pgTable(
	'resolution_sponsors',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		resolutionId: uuid('resolution_id')
			.notNull()
			.references(() => resolutions.id),
		delegateId: uuid('delegate_id')
			.notNull()
			.references(() => delegates.id),
		role: sponsorRole('role').notNull().default('co_submitter')
	},
	(t) => [unique('resolution_sponsors_uq').on(t.resolutionId, t.delegateId)]
);

export const amendments = pgTable('amendments', {
	id: uuid('id').defaultRandom().primaryKey(),
	resolutionId: uuid('resolution_id')
		.notNull()
		.references(() => resolutions.id),
	targetClauseId: uuid('target_clause_id').references(() => resolutionClauses.id),
	type: amendmentType('type').notNull(),
	action: amendmentAction('action').notNull(),
	text: text('text').notNull().default(''),
	proposedById: uuid('proposed_by_id')
		.notNull()
		.references(() => delegates.id),
	status: amendmentStatus('status').notNull().default('proposed'),
	voteId: uuid('vote_id').references(() => votes.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/* ------------------------------------------------------------------ *
 * Integrity
 * ------------------------------------------------------------------ */

export const auditLog = pgTable('audit_log', {
	id: uuid('id').defaultRandom().primaryKey(),
	conferenceId: uuid('conference_id').references(() => conferences.id),
	committeeId: uuid('committee_id').references(() => committees.id),
	actorId: uuid('actor_id').references(() => delegates.id),
	action: text('action').notNull(),
	detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/* ------------------------------------------------------------------ *
 * Documents & position papers
 * ------------------------------------------------------------------ */

// Uploaded files, stored as bytea on Postgres (swappable for Vercel Blob later).
export const files = pgTable('files', {
	id: uuid('id').defaultRandom().primaryKey(),
	committeeId: uuid('committee_id')
		.notNull()
		.references(() => committees.id),
	kind: fileKind('kind').notNull(),
	title: text('title').notNull().default(''),
	fileName: text('file_name').notNull(),
	mime: text('mime').notNull(),
	sizeBytes: integer('size_bytes').notNull(),
	bytes: bytea('bytes').notNull(),
	// For position papers: the delegation it belongs to. Also the uploader.
	delegateId: uuid('delegate_id').references(() => delegates.id),
	uploadedById: uuid('uploaded_by_id')
		.notNull()
		.references(() => delegates.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
