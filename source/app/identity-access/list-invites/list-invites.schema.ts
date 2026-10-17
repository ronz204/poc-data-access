import { Cursor, type CursorKey, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@core/shared-kernel";
import { InvitationView } from "../identity-access.views";
import { z } from "zod";

export const ListInvitesInput = z.object({
	cursor: z.string().max(200).optional(),
	pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});
export type ListInvitesInput = z.infer<typeof ListInvitesInput>;

export interface ListInvitesCommand {
	readonly after: CursorKey | null;
	readonly pageSize: number;
}

export const toListInvitesCommand = (input: ListInvitesInput): ListInvitesCommand => ({
	after: input.cursor === undefined ? null : Cursor.decode(input.cursor),
	pageSize: input.pageSize ?? DEFAULT_PAGE_SIZE,
});

export const ListInvitesOutput = z.object({
	items: z.array(InvitationView),
	nextCursor: z.string().nullable(),
});
export type ListInvitesOutput = z.infer<typeof ListInvitesOutput>;
