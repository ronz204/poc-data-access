import { SignUpUserHandler } from "@app/identity-access/sign-up-user/sign-up-user.handler";
import { UserRepository } from "@repos/identity-access/user/user.repository";
import type { IUserRepository } from "@core/identity-access";
import { type Module, token } from "dockdi";
import { DataDockey } from "@keys/data.dockey";

export class IdentityAccessDockey {
	static readonly UserRepository = token<IUserRepository>("UserRepository");
	static readonly SignUpUser = token(SignUpUserHandler);

	static module(): Module {
		return (container) => {
			container.bind(IdentityAccessDockey.UserRepository).toClass(UserRepository, [DataDockey.Executor]);
			container.bind(IdentityAccessDockey.SignUpUser).toClass(SignUpUserHandler, [IdentityAccessDockey.UserRepository]);
		};
	}
}
