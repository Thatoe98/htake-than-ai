ALTER TABLE "messages" ADD COLUMN "client_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "parts" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_client_uq" ON "messages" USING btree ("conversation_id","client_id");