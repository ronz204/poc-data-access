import { type Infer, literalsOf, uuidOf } from "@core/shared-kernel";

export const MembershipId = uuidOf("MembershipId");
export type MembershipId = Infer<typeof MembershipId>;

export const MembershipRole = literalsOf("MembershipRole", ["owner", "admin", "member"]);
export type MembershipRole = Infer<typeof MembershipRole>;
