import type { ChangePassword } from "@app/users/change-password.usecase";
import type { UserRepository } from "@core/users/user.repository";
import { token } from "dockdi";

export const UserRepositoryToken = token<UserRepository>("UserRepository");
export const ChangePasswordToken = token<ChangePassword>("ChangePassword");
