CREATE TYPE "public"."amendment_action" AS ENUM('add', 'amend', 'strike');--> statement-breakpoint
CREATE TYPE "public"."amendment_status" AS ENUM('proposed', 'accepted', 'voting', 'passed', 'failed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."amendment_type" AS ENUM('friendly', 'unfriendly');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('absent', 'present', 'present_and_voting');--> statement-breakpoint
CREATE TYPE "public"."ballot_choice" AS ENUM('for', 'against', 'abstain', 'pass');--> statement-breakpoint
CREATE TYPE "public"."clause_kind" AS ENUM('preambulatory', 'operative');--> statement-breakpoint
CREATE TYPE "public"."committee_status" AS ENUM('pending', 'in_session', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."delegate_role" AS ENUM('delegate', 'chair', 'deputy_chair', 'admin', 'secretariat');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('position_paper', 'background_guide', 'rop', 'agenda', 'study_guide', 'other');--> statement-breakpoint
CREATE TYPE "public"."floor_mode" AS ENUM('closed', 'roll_call', 'formal_debate', 'moderated_caucus', 'unmoderated_caucus', 'voting');--> statement-breakpoint
CREATE TYPE "public"."majority_rule" AS ENUM('simple', 'two_thirds');--> statement-breakpoint
CREATE TYPE "public"."motion_status" AS ENUM('proposed', 'seconded', 'voting', 'passed', 'failed', 'withdrawn', 'tabled');--> statement-breakpoint
CREATE TYPE "public"."motion_type" AS ENUM('moderated_caucus', 'unmoderated_caucus', 'extend_debate', 'introduce_resolution', 'move_to_voting', 'adjourn_debate', 'suspend_session', 'close_debate');--> statement-breakpoint
CREATE TYPE "public"."point_type" AS ENUM('order', 'information', 'personal_privilege', 'parliamentary_inquiry');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('waiting', 'speaking', 'done', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."resolution_status" AS ENUM('lobbying', 'submitted', 'approved', 'on_floor', 'adopted', 'failed', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."sponsor_role" AS ENUM('main_submitter', 'co_submitter', 'signatory');--> statement-breakpoint
CREATE TYPE "public"."vote_kind" AS ENUM('procedural', 'substantive');--> statement-breakpoint
CREATE TYPE "public"."vote_method" AS ENUM('placard', 'roll_call');--> statement-breakpoint
CREATE TYPE "public"."vote_result" AS ENUM('passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."vote_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."vote_subject_type" AS ENUM('motion', 'amendment', 'resolution');--> statement-breakpoint
CREATE TABLE "amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resolution_id" uuid NOT NULL,
	"target_clause_id" uuid,
	"type" "amendment_type" NOT NULL,
	"action" "amendment_action" NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"proposed_by_id" uuid NOT NULL,
	"status" "amendment_status" DEFAULT 'proposed' NOT NULL,
	"vote_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"delegate_id" uuid NOT NULL,
	"status" "attendance_status" DEFAULT 'absent' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_committee_delegate_uq" UNIQUE("committee_id","delegate_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conference_id" uuid,
	"committee_id" uuid,
	"actor_id" uuid,
	"action" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ballots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vote_id" uuid NOT NULL,
	"delegate_id" uuid NOT NULL,
	"choice" "ballot_choice" NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ballots_vote_delegate_round_uq" UNIQUE("vote_id","delegate_id","round")
);
--> statement-breakpoint
CREATE TABLE "committee_floor" (
	"committee_id" uuid PRIMARY KEY NOT NULL,
	"mode" "floor_mode" DEFAULT 'closed' NOT NULL,
	"active_motion_id" uuid,
	"active_resolution_id" uuid,
	"current_speaker_id" uuid,
	"speaker_timer_ends_at" timestamp with time zone,
	"caucus_timer_ends_at" timestamp with time zone,
	"caucus_topic" text,
	"debate_side" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conference_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"topic" text DEFAULT '' NOT NULL,
	"agenda" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "committee_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "committees_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "conferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conferences_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "delegates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"country" text DEFAULT '' NOT NULL,
	"role" "delegate_role" DEFAULT 'delegate' NOT NULL,
	"committee_id" uuid,
	"invite_code" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delegates_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"kind" "file_kind" NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"delegate_id" uuid,
	"uploaded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"delegate_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "motions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"proposed_by_id" uuid NOT NULL,
	"type" "motion_type" NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "motion_status" DEFAULT 'proposed' NOT NULL,
	"precedence_rank" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"by_id" uuid NOT NULL,
	"type" "point_type" NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolution_clauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resolution_id" uuid NOT NULL,
	"kind" "clause_kind" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolution_sponsors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resolution_id" uuid NOT NULL,
	"delegate_id" uuid NOT NULL,
	"role" "sponsor_role" DEFAULT 'co_submitter' NOT NULL,
	CONSTRAINT "resolution_sponsors_uq" UNIQUE("resolution_id","delegate_id")
);
--> statement-breakpoint
CREATE TABLE "resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"agenda_issue" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"main_submitter_id" uuid,
	"status" "resolution_status" DEFAULT 'lobbying' NOT NULL,
	"designation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"introduced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"delegate_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"delegate_id" uuid NOT NULL,
	"status" "queue_status" DEFAULT 'waiting' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"subject_type" "vote_subject_type" NOT NULL,
	"subject_id" uuid,
	"label" text DEFAULT '' NOT NULL,
	"kind" "vote_kind" NOT NULL,
	"majority_rule" "majority_rule" DEFAULT 'simple' NOT NULL,
	"method" "vote_method" DEFAULT 'placard' NOT NULL,
	"status" "vote_status" DEFAULT 'open' NOT NULL,
	"result" "vote_result",
	"round" integer DEFAULT 1 NOT NULL,
	"tally_for" integer DEFAULT 0 NOT NULL,
	"tally_against" integer DEFAULT 0 NOT NULL,
	"tally_abstain" integer DEFAULT 0 NOT NULL,
	"opens_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closes_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_target_clause_id_resolution_clauses_id_fk" FOREIGN KEY ("target_clause_id") REFERENCES "public"."resolution_clauses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_proposed_by_id_delegates_id_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amendments" ADD CONSTRAINT "amendments_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_delegate_id_delegates_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_conference_id_conferences_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conferences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_delegates_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_delegate_id_delegates_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_floor" ADD CONSTRAINT "committee_floor_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_floor" ADD CONSTRAINT "committee_floor_current_speaker_id_delegates_id_fk" FOREIGN KEY ("current_speaker_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_conference_id_conferences_id_fk" FOREIGN KEY ("conference_id") REFERENCES "public"."conferences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegates" ADD CONSTRAINT "delegates_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_delegate_id_delegates_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_id_delegates_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_delegate_id_delegates_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motions" ADD CONSTRAINT "motions_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motions" ADD CONSTRAINT "motions_proposed_by_id_delegates_id_fk" FOREIGN KEY ("proposed_by_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_from_id_delegates_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_to_id_delegates_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_by_id_delegates_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_clauses" ADD CONSTRAINT "resolution_clauses_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_sponsors" ADD CONSTRAINT "resolution_sponsors_resolution_id_resolutions_id_fk" FOREIGN KEY ("resolution_id") REFERENCES "public"."resolutions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolution_sponsors" ADD CONSTRAINT "resolution_sponsors_delegate_id_delegates_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolutions" ADD CONSTRAINT "resolutions_main_submitter_id_delegates_id_fk" FOREIGN KEY ("main_submitter_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_delegate_id_delegates_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_queue" ADD CONSTRAINT "speaker_queue_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_queue" ADD CONSTRAINT "speaker_queue_delegate_id_delegates_id_fk" FOREIGN KEY ("delegate_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amendments_resolution_idx" ON "amendments" USING btree ("resolution_id");--> statement-breakpoint
CREATE INDEX "delegates_committee_idx" ON "delegates" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "files_committee_idx" ON "files" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "messages_committee_created_idx" ON "messages" USING btree ("committee_id","created_at");--> statement-breakpoint
CREATE INDEX "motions_committee_status_idx" ON "motions" USING btree ("committee_id","status");--> statement-breakpoint
CREATE INDEX "notes_committee_idx" ON "notes" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "points_committee_idx" ON "points" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "resolution_clauses_resolution_idx" ON "resolution_clauses" USING btree ("resolution_id");--> statement-breakpoint
CREATE INDEX "resolutions_committee_idx" ON "resolutions" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "speaker_queue_committee_status_idx" ON "speaker_queue" USING btree ("committee_id","status");--> statement-breakpoint
CREATE INDEX "votes_committee_status_idx" ON "votes" USING btree ("committee_id","status");