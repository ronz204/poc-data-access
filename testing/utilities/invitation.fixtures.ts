import { Invitation, InvitationId, type InvitationRole, TokenHash } from "@core/identity-access";
import { createHash } from "node:crypto";
import { Email } from "@core/shared-kernel";
import { TENANT, userOf } from "./membership.fixtures";

export const NOW = new Date("2026-03-01T00:00:00.000Z");
export const DAY = 24 * 60 * 60 * 1000;

export const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

export const idOf = (n: number) => `0192f3a4-5b6c-7d8e-9f01-30000000${String(n).padStart(4, "0")}`;

export function invitationFor(
	n: number,
	token: string,
	overrides: { email?: string; role?: InvitationRole; issuedAt?: Date; invitedBy?: number } = {},
): Invitation {
	return Invitation.issue(
		{
			id: InvitationId.parse(idOf(n)),
			tenantId: TENANT,
			invitedBy: userOf(overrides.invitedBy ?? 1),
			email: Email.parse(overrides.email ?? "guest@example.com"),
			role: overrides.role ?? "member",
			tokenHash: TokenHash.parse(hashOf(token)),
		},
		overrides.issuedAt ?? NOW,
	);
}
