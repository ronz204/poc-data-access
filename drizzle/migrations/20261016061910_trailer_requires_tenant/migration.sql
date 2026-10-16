ALTER TABLE "platform"."trailer" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER POLICY "trailer_insert_policy" ON "platform"."trailer" TO "runner" WITH CHECK ("platform"."trailer"."tenant_id" = nullif(current_setting('app.tenant', true), '')::uuid
					and "platform"."trailer"."actor_id" is not distinct from nullif(current_setting('app.actor', true), '')::uuid
					and "platform"."trailer"."origin" = nullif(current_setting('app.origin', true), ''));