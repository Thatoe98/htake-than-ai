-- Circular FK: a team's manager is a user, a user belongs to a team.
ALTER TABLE "teams" ADD CONSTRAINT "teams_manager_id_users_id_fk"
  FOREIGN KEY ("manager_id") REFERENCES "users"("id");
--> statement-breakpoint
-- Vector search (K-4): cosine distance on text-embedding-3-small vectors.
CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
-- Keyword search for Burmese (no word spaces): trigram index, not full-text search.
CREATE INDEX "chunks_text_trgm_idx" ON "chunks" USING gin ("text" gin_trgm_ops);
