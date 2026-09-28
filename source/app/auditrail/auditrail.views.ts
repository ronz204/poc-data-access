import type { UserId } from "@core/users/user.ids";

export interface AuditrailEntry {
	readonly id: string;
	readonly actorId: UserId | null;
	readonly action: string;
	readonly entity: string;
	readonly entityId: string | null;
	readonly changes: Readonly<Record<string, readonly [unknown, unknown]>> | null;
	readonly txid: number;
	readonly occurredAt: Date;
}
