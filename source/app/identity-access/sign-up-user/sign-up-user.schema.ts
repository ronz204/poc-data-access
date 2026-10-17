import { UserName } from "@core/identity-access";
import { Email } from "@core/shared-kernel";
import { z } from "zod";

export const SignUpUserInput = z.object({
	email: z.string().max(320),
	name: z.string().max(200),
});
export type SignUpUserInput = z.infer<typeof SignUpUserInput>;

export interface SignUpUserCommand {
	readonly email: Email;
	readonly name: UserName;
}

export const toSignUpUserCommand = (input: SignUpUserInput): SignUpUserCommand => ({
	email: Email.parse(input.email),
	name: UserName.parse(input.name),
});

export const SignUpUserOutput = z.object({
	id: z.uuid(),
	email: z.string(),
	name: z.string(),
	createdAt: z.iso.datetime(),
});
export type SignUpUserOutput = z.infer<typeof SignUpUserOutput>;
