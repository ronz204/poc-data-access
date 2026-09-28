export class TenantSlugTakenError extends Error {
	constructor(readonly slug: string) {
		super(`tenant slug "${slug}" is already taken`);
		this.name = "TenantSlugTakenError";
	}
}
