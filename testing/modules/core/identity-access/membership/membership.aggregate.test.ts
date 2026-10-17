import { Membership, MembershipId } from "@core/identity-access";
import { TenantId, UserId } from "@core/shared-kernel";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-01-01T00:00:00.000Z");
const input = {
	id: MembershipId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abcd"),
	tenantId: TenantId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abce"),
	userId: UserId.parse("0192f3a4-5b6c-7d8e-9f01-23456789abcf"),
};

describe("Membership", () => {
	it("enrolls an active owner stamped with the given time", () => {
		const membership = Membership.enrollOwner(input, NOW);
		expect(membership).toMatchObject({ ...input, role: "owner", createdAt: NOW, removedAt: null });
		expect(Object.isFrozen(membership)).toBe(true);
	});
});

describe("Membership transitions", () => {
	const owner = Membership.enrollOwner(input, NOW);

	it("changes the role into a new instance, leaving the receiver untouched", () => {
		const admin = owner.changeRole("admin");
		expect(admin).not.toBe(owner);
		expect(admin.role).toBe("admin");
		expect(admin.sameAs(owner)).toBe(true);
		expect(owner.role).toBe("owner");
	});

	it("returns the receiver when the role is unchanged", () => {
		expect(owner.changeRole("owner")).toBe(owner);
	});

	it("removes by stamping removedAt, keeping everything else", () => {
		const later = new Date("2026-02-01T00:00:00.000Z");
		const removed = owner.remove(later);
		expect(removed).toMatchObject({ ...input, role: "owner", createdAt: NOW, removedAt: later });
		expect(owner.isActive()).toBe(true);
		expect(removed.isActive()).toBe(false);
	});
});
