import { type Infer, uuidOf } from "@core/shared-kernel";

export const MembershipId = uuidOf("MembershipId");
export type MembershipId = Infer<typeof MembershipId>;
