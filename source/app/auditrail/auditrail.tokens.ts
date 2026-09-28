import type { ListAuditrail } from "@app/auditrail/auditrail.queries";
import { token } from "dockdi";

export const ListAuditrailToken = token<ListAuditrail>("ListAuditrail");
