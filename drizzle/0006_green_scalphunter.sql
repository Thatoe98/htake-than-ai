CREATE TABLE "content_styles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"writing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_styles" ADD CONSTRAINT "content_styles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;