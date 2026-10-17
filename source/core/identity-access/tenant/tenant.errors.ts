import { DomainError } from "@core/shared-kernel";

export class TenantError extends DomainError.define({
	invalid_name: "the name must not be empty and must fit the maximum length",
}) {}
