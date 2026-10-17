import { Problem, type StatusMap } from "@infra/plugins/http.problem";
import { signUpUserPlugin } from "./sign-up-user/sign-up-user.plugin";
import type { Transactor } from "@dal/dal.transactor";
import { UserError } from "@core/identity-access";
import { Elysia } from "elysia";

const USER_STATUSES: StatusMap<UserError["code"]> = { invalid_name: 422, email_taken: 409 };

export const identityAccessPlugin = (transactor: Transactor) =>
	new Elysia({ detail: { tags: ["Identity"] } })
		.onError({ as: "scoped" }, ({ error, set }) => {
			if (error instanceof UserError) return Problem.domain(set, error, USER_STATUSES);
		})
		.use(signUpUserPlugin(transactor));
