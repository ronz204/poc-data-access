import { uuidv7 } from "uuidv7";

export class Identity {
	static next<Id extends string>(): Id {
		return uuidv7() as Id;
	}
}
