import { type Module, token } from "dockdi";
import { uuidv7 } from "uuidv7";

export type Clock = () => Date;
export type NewId = () => string;

export class SystemDockey {
	static readonly Clock = token<Clock>("Clock");
	static readonly NewId = token<NewId>("NewId");

	static module(): Module {
		return (container) => {
			container.bind(SystemDockey.Clock).toValue(() => new Date());
			container.bind(SystemDockey.NewId).toValue(uuidv7);
		};
	}
}
