export class Criteria {
	static escapeLike(value: string): string {
		return value.replace(/[\\%_]/g, "\\$&");
	}
}
