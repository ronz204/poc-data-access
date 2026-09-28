import type { OnboardTenant } from "@app/tenants/onboard-tenant.usecase";
import type { TenantRepository } from "@core/tenants/tenant.repository";
import { token } from "dockdi";

export const TenantRepositoryToken = token<TenantRepository>("TenantRepository");
export const OnboardTenantToken = token<OnboardTenant>("OnboardTenant");
