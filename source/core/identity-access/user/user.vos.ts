import { type Infer, textOf } from "@core/shared-kernel";
import { UserError } from "./user.errors";

export const UserName = textOf("UserName", {
	max: 120,
	fail: (limits) => new UserError("invalid_name", limits),
});
export type UserName = Infer<typeof UserName>;
