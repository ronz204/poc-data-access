CREATE TABLE "platform"."trailer" (
	"id" uuid PRIMARY KEY,
	"tenant_id" uuid,
	"actor_id" uuid,
	"origin" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"xact_id" xid8 DEFAULT pg_current_xact_id() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trailer_action_check" CHECK ("action" ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
	CONSTRAINT "trailer_origin_check" CHECK ("origin" ~ '^[a-z0-9_]+(:[a-z0-9_]+)?$')
);
--> statement-breakpoint
ALTER TABLE "platform"."trailer" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform"."memberships" ADD COLUMN "id" uuid;--> statement-breakpoint
ALTER TABLE "platform"."memberships" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform"."memberships" DROP CONSTRAINT "memberships_pkey";--> statement-breakpoint
ALTER TABLE "platform"."memberships" ADD PRIMARY KEY ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_tenant_id_user_id_active_idx" ON "platform"."memberships" ("tenant_id","user_id") WHERE "removed_at" is null;--> statement-breakpoint
CREATE INDEX "trailer_tenant_id_occurred_at_id_idx" ON "platform"."trailer" ("tenant_id","occurred_at","id");--> statement-breakpoint
ALTER TABLE "platform"."trailer" ADD CONSTRAINT "trailer_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id");--> statement-breakpoint
CREATE POLICY "trailer_select_policy" ON "platform"."trailer" AS PERMISSIVE FOR SELECT TO "runner" USING ("platform"."trailer"."tenant_id" = nullif(current_setting('app.tenant', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "trailer_insert_policy" ON "platform"."trailer" AS PERMISSIVE FOR INSERT TO "runner" WITH CHECK ("platform"."trailer"."tenant_id" is not distinct from nullif(current_setting('app.tenant', true), '')::uuid
					and "platform"."trailer"."actor_id" is not distinct from nullif(current_setting('app.actor', true), '')::uuid
					and "platform"."trailer"."origin" = nullif(current_setting('app.origin', true), ''));