import { type Infer, textOf } from "@core/shared-kernel/primitive/primitive.vos";
import { EmailError } from "./email.errors";

export const Email = textOf("Email", {
	max: 254,
	pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	normalize: (value) => value.toLowerCase(),
	fail: () => new EmailError("invalid_email"),
});
export type Email = Infer<typeof Email>;
