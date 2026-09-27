CREATE TYPE "core"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "core"."tenant_plan" AS ENUM('free', 'pro');--> statement-breakpoint
CREATE TYPE "core"."tenant_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TABLE "core"."memberships" (
	"tenant_id" uuid,
	"user_id" uuid,
	"role" "core"."member_role" DEFAULT 'member'::"core"."member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_pkey" PRIMARY KEY("tenant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "core"."memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."projects" (
	"id" uuid PRIMARY KEY,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_tenant_id_slug_key" UNIQUE("tenant_id","slug"),
	CONSTRAINT "projects_tenant_id_id_key" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "core"."projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."tasks" (
	"id" uuid PRIMARY KEY,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."tenants" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"plan" "core"."tenant_plan" DEFAULT 'free'::"core"."tenant_plan" NOT NULL,
	"status" "core"."tenant_status" DEFAULT 'active'::"core"."tenant_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."tenants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "core"."users" (
	"id" uuid PRIMARY KEY,
	"email" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "core"."memberships" ("user_id");--> statement-breakpoint
CREATE INDEX "projects_tenant_id_created_at_idx" ON "core"."projects" ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_tenant_id_project_id_idx" ON "core"."tasks" ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "tasks_tenant_id_created_at_idx" ON "core"."tasks" ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "core"."memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."memberships" ADD CONSTRAINT "memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "core"."users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core"."tenants"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_tenant_id_project_id_fkey" FOREIGN KEY ("tenant_id","project_id") REFERENCES "core"."projects"("tenant_id","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."memberships" AS PERMISSIVE FOR ALL TO "runner" USING ("core"."memberships"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("core"."memberships"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."projects" AS PERMISSIVE FOR ALL TO "runner" USING ("core"."projects"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("core"."projects"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."tasks" AS PERMISSIVE FOR ALL TO "runner" USING ("core"."tasks"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("core"."tasks"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "core"."tenants" AS PERMISSIVE FOR ALL TO "runner" USING ("core"."tenants"."id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("core"."tenants"."id" = current_setting('app.tenant_id', true)::uuid);