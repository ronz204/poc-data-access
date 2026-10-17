import { type IMembershipRepository, type Membership, MembershipError } from "@core/identity-access";
import { memberships } from "@db/models/platform/memberships.model";
import type { RunExecutor } from "@dal/dal.transactor";
import { ViolationTranslator } from "@dal/dal.translator";
import type { TenantId, UserId } from "@core/shared-kernel";
import { MembershipMapper } from "./membership.mapper";
import { and, count, eq, isNull } from "drizzle-orm";

export class MembershipRepository implements IMembershipRepository {
	constructor(private readonly executor: RunExecutor) {}

	async findActive(tenantId: TenantId, userId: UserId): Promise<Membership | null> {
		const [row] = await this.executor
			.select()
			.from(memberships)
			.where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId), isNull(memberships.removedAt)))
			.limit(1);
		return row ? MembershipMapper.toDomain(row) : null;
	}

	async countActiveOwners(tenantId: TenantId): Promise<number> {
		const [row] = await this.executor
			.select({ owners: count() })
			.from(memberships)
			.where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner"), isNull(memberships.removedAt)));
		return row?.owners ?? 0;
	}

	async insert(membership: Membership): Promise<void> {
		await ViolationTranslator.translate(this.executor.insert(memberships).values(MembershipMapper.toRow(membership)), {
			memberships_user_id_users_id_fkey: () => new MembershipError("user_not_found"),
		});
	}

	async update(membership: Membership): Promise<void> {
		const { role, removedAt } = MembershipMapper.toRow(membership);
		await this.executor.update(memberships).set({ role, removedAt }).where(eq(memberships.id, membership.id));
	}
}
