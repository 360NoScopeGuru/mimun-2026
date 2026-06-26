CREATE TABLE "crisis_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"committee_id" uuid NOT NULL,
	"kind" text DEFAULT 'update' NOT NULL,
	"text" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crisis_updates" ADD CONSTRAINT "crisis_updates_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crisis_updates" ADD CONSTRAINT "crisis_updates_author_id_delegates_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."delegates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crisis_updates_committee_created_idx" ON "crisis_updates" USING btree ("committee_id","created_at");