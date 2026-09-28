import type { TransactorContext } from "@dal/dal.transactor";
import type { Executor } from "@db/helpers/executor.helper";
import { type AuditChanges, auditrail } from "@db/models/auditrail.model";
import { token } from "dockdi";

export interface AuditEntry {
	readonly action: string;
	readonly entity: string;
	readonly entityId?: string | null;
	readonly changes?: AuditChanges | null;
}

export const ChroniclerToken = token<Chronicler>("Chronicler");

export class Chronicler {
	constructor(
		private readonly tx: Executor,
		private readonly context: TransactorContext,
	) {}

	async record(entry: AuditEntry): Promise<void> {
		await this.tx.insert(auditrail).values({
			...entry,
			tenantId: this.context.tenantId,
			actorId: this.context.actorId,
		});
	}

	static diff<T extends object>(before: T, after: Partial<T>): AuditChanges {
		const changes: Record<string, readonly [unknown, unknown]> = {};
		for (const [field, value] of Object.entries(after)) {
			const previous = before[field as keyof T];
			if (previous !== value) changes[field] = [previous, value];
		}
		return changes;
	}

	static created(values: object): AuditChanges {
		return Object.fromEntries(
			Object.entries(values).map(([field, value]) => [field, [null, value]]),
		);
	}
}
