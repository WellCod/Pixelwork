CREATE INDEX "invites_space_id_idx" ON "invites" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_id_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "org_members_user_id_idx" ON "org_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "space_members_user_id_idx" ON "space_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_guest_expires_at_idx" ON "users" USING btree ("guest_expires_at") WHERE "users"."is_guest";--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_uses_left" CHECK ("invites"."uses_left" is null or "invites"."uses_left" >= 0);--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_status_emoji_length" CHECK (char_length("space_members"."status_emoji") <= 16);