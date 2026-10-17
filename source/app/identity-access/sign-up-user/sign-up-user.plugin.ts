import { IdentityAccessDockey } from "@app/identity-access/identity-access.dockey";
import { SignUpUserInput, SignUpUserOutput } from "./sign-up-user.schema";
import type { Transactor } from "@dal/dal.transactor";
import { RunContext } from "@dal/dal.contexter";
import { Elysia } from "elysia";

export const signUpUserPlugin = (transactor: Transactor) =>
	new Elysia().post(
		"/users",
		async ({ body, request, set, status }) => {
			const user = await transactor.run(RunContext.system("request"), IdentityAccessDockey.SignUpUser, (handler) =>
				handler.execute(body),
			);

			set.headers.location = `${new URL(request.url).pathname}/${user.id}`;
			return status(201, user);
		},
		{
			body: SignUpUserInput,
			response: { 201: SignUpUserOutput },
			detail: { summary: "Sign up a user" },
		},
	);
