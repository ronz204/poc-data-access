import { type Brand, textOf } from "@core/shared-kernel";
import { UserError } from "./user.errors";

export type UserName = Brand<string, "UserName">;

export const UserName = textOf("UserName", {
	max: 120,
	fail: (limits) => new UserError("invalid_name", limits),
});
