import type { AuditrailEntry } from "@app/auditrail/auditrail.views";
import type { Page, Paging } from "@app/shared/paging.type";

export interface ListAuditrailParams {
	readonly paging: Paging;
}

export interface ListAuditrail {
	execute(params: ListAuditrailParams): Promise<Page<AuditrailEntry>>;
}
