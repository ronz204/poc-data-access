import { type Brand, textOf } from "@core/shared-kernel/primitive/primitive.vos";
import { EmailError } from "./email.errors";

export type Email = Brand<string, "Email">;

export const Email = textOf("Email", {
	max: 254,
	pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	normalize: (value) => value.toLowerCase(),
	fail: () => new EmailError("invalid_email"),
});
