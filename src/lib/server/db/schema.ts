import { pgTable, text, timestamp, integer, uuid, pgEnum } from 'drizzle-orm/pg-core';

export const delegateRole = pgEnum('delegate_role', ['delegate', 'chair', 'admin']);
export const committeeStatus = pgEnum('committee_status', ['pending', 'in_session', 'suspended', 'closed']);
export const queueStatus = pgEnum('queue_status', ['waiting', 'speaking', 'done', 'withdrawn']);

export const committees = pgTable('committees', {
	id: uuid('id').defaultRandom().primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	topic: text('topic').notNull().default(''),
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
