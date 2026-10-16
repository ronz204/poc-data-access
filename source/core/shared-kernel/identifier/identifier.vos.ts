import { type Uuid, uuidOf } from "@core/shared-kernel/primitive/primitive.vos";

export type UserId = Uuid<"UserId">;
export const UserId = uuidOf("UserId");

export type TenantId = Uuid<"TenantId">;
export const TenantId = uuidOf("TenantId");
