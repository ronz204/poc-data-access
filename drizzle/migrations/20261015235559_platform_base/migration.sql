CREATE TABLE "platform"."invitations" (
	"id" uuid PRIMARY KEY,
	"tenant_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	CONSTRAINT "invitations_role_check" CHECK ("role" IN ('admin', 'member')),
	CONSTRAINT "invitations_status_check" CHECK ("status" IN ('pending', 'accepted', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "platform"."memberships" (
	"tenant_id" uuid,
	"user_id" uuid,
	"role" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "memberships_pkey" PRIMARY KEY("tenant_id","user_id"),
	CONSTRAINT "memberships_role_check" CHECK ("role" IN ('owner', 'admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "platform"."tenants" (
	"id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform"."users" (
	"id" uuid PRIMARY KEY,
	"email" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "invitations_tenant_id_created_at_id_idx" ON "platform"."invitations" ("tenant_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_tenant_id_email_pending_idx" ON "platform"."invitations" ("tenant_id","email") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "memberships_user_id_idx" ON "platform"."memberships" ("user_id");--> statement-breakpoint
ALTER TABLE "platform"."invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id");--> statement-breakpoint
ALTER TABLE "platform"."invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fkey" FOREIGN KEY ("invited_by") REFERENCES "platform"."users"("id");--> statement-breakpoint
ALTER TABLE "platform"."memberships" ADD CONSTRAINT "memberships_tenant_id_tenants_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id");--> statement-breakpoint
ALTER TABLE "platform"."memberships" ADD CONSTRAINT "memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id");