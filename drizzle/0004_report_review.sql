ALTER TABLE "daily_reports" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD COLUMN "acknowledged_by" uuid;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD COLUMN "resolved_blockers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;