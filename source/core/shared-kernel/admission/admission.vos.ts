import { type Infer, literalsOf } from "../primitive/primitive.vos";

export const MembershipRole = literalsOf("MembershipRole", ["owner", "admin", "member"]);
export type MembershipRole = Infer<typeof MembershipRole>;
