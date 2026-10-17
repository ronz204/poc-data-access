import { type Infer, literalsOf, textOf, uuidOf } from "@core/shared-kernel";
import { InvitationError } from "./invitation.errors";

export const InvitationId = uuidOf("InvitationId");
export type InvitationId = Infer<typeof InvitationId>;

export const InvitationRole = literalsOf("InvitationRole", ["admin", "member"]);
export type InvitationRole = Infer<typeof InvitationRole>;

export const InvitationStatus = literalsOf("InvitationStatus", ["pending", "accepted", "revoked"]);
export type InvitationStatus = Infer<typeof InvitationStatus>;

export const TokenHash = textOf("TokenHash", {
	min: 64,
	max: 64,
	pattern: /^[0-9a-f]{64}$/,
	fail: () => new InvitationError("invalid_token_hash"),
});
export type TokenHash = Infer<typeof TokenHash>;
