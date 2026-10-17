import { domainProblem, type StatusMap } from "@infra/plugins/errors.plugin";
import { SignUpUserPlugin } from "./sign-up-user/sign-up-user.plugin";
import type { Transactor } from "@dal/dal.transactor";
import { UserError } from "@core/identity-access";
import { Elysia } from "elysia";

const USER_STATUSES: StatusMap<UserError["code"]> = { invalid_name: 422, email_taken: 409 };

export class IdentityAccessPlugin {
	static create(transactor: Transactor) {
		return new Elysia({ detail: { tags: ["Identity"] } })
			.onError({ as: "scoped" }, ({ error, set }) => {
				if (error instanceof UserError) return domainProblem(set, error, USER_STATUSES);
			})
			.use(SignUpUserPlugin.create(transactor));
	}
}
