import type { ListAuditrail, ListAuditrailParams } from "@app/auditrail/auditrail.queries";
import type { AuditrailEntry } from "@app/auditrail/auditrail.views";
import type { Page } from "@app/shared/paging.type";
import type { Executor } from "@db/helpers/executor.helper";
import { auditrail } from "@db/models/auditrail.model";
import { Paginator } from "@infra/shared/paginator.helper";

export class DrizzleListAuditrail implements ListAuditrail {
	constructor(private readonly tx: Executor) {}

	async execute({ paging }: ListAuditrailParams): Promise<Page<AuditrailEntry>> {
		const rows = await this.tx
			.select({
				id: auditrail.id,
				actorId: auditrail.actorId,
				action: auditrail.action,
				entity: auditrail.entity,
				entityId: auditrail.entityId,
				changes: auditrail.changes,
				txid: auditrail.txid,
				occurredAt: auditrail.occurredAt,
			})
			.from(auditrail)
			.where(Paginator.after(auditrail, auditrail.id, auditrail.id, "asc", paging))
			.orderBy(...Paginator.order(auditrail.id, auditrail.id, "asc"))
			.limit(paging.limit + 1);

		return Paginator.page(rows as AuditrailEntry[], paging.limit);
	}
}
