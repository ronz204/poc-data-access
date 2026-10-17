import { z } from "zod";

export const SignUpUserInput = z.object({
	email: z.string().max(320),
	name: z.string().max(200),
});
export type SignUpUserInput = z.infer<typeof SignUpUserInput>;

export const SignUpUserOutput = z.object({
	id: z.uuid(),
	email: z.string(),
	name: z.string(),
	createdAt: z.iso.datetime(),
});
export type SignUpUserOutput = z.infer<typeof SignUpUserOutput>;
