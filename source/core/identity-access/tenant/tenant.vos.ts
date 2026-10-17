import { type Infer, textOf } from "@core/shared-kernel";
import { TenantError } from "./tenant.errors";

export const TenantName = textOf("TenantName", {
	max: 120,
	fail: (limits) => new TenantError("invalid_name", limits),
});
export type TenantName = Infer<typeof TenantName>;
