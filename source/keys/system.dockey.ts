import { createHash, randomBytes } from "node:crypto";
import { type Module, token } from "dockdi";
import { uuidv7 } from "uuidv7";

export type Clock = () => Date;
export type NewId = () => string;
export type NewToken = () => string;
export type HashToken = (token: string) => string;

export class SystemDockey {
	static readonly Clock = token<Clock>("Clock");
	static readonly NewId = token<NewId>("NewId");
	static readonly NewToken = token<NewToken>("NewToken");
	static readonly HashToken = token<HashToken>("HashToken");

	static module(): Module {
		return (container) => {
			container.bind(SystemDockey.Clock).toValue(() => new Date());
			container.bind(SystemDockey.NewId).toValue(uuidv7);
			container.bind(SystemDockey.NewToken).toValue(() => randomBytes(32).toString("base64url"));
			container.bind(SystemDockey.HashToken).toValue((value) => createHash("sha256").update(value).digest("hex"));
		};
	}
}
