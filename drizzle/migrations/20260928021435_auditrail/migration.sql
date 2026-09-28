CREATE TABLE "core"."auditrail" (
	"id" uuid PRIMARY KEY,
	"tenant_id" uuid,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"changes" jsonb,
	"txid" bigint DEFAULT txid_current() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."auditrail" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "auditrail_tenant_id_occurred_at_idx" ON "core"."auditrail" ("tenant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "auditrail_actor_id_occurred_at_idx" ON "core"."auditrail" ("actor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "auditrail_entity_entity_id_idx" ON "core"."auditrail" ("entity","entity_id");--> statement-breakpoint
CREATE POLICY "auditrail_insert" ON "core"."auditrail" AS PERMISSIVE FOR INSERT TO "runner" WITH CHECK ("core"."auditrail"."tenant_id" is not distinct from nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "auditrail_select" ON "core"."auditrail" AS PERMISSIVE FOR SELECT TO "runner" USING ("core"."auditrail"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);