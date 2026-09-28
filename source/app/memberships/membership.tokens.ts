import type { MembershipRepository } from "@core/memberships/membership.repository";
import { token } from "dockdi";

export const MembershipRepositoryToken = token<MembershipRepository>("MembershipRepository");
