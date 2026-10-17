import { type Infer, uuidOf } from "../primitive/primitive.vos";

export const UserId = uuidOf("UserId");
export type UserId = Infer<typeof UserId>;

export const TenantId = uuidOf("TenantId");
export type TenantId = Infer<typeof TenantId>;
