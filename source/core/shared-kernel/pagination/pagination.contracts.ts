export interface Page<T> {
	readonly items: readonly T[];
	readonly nextCursor: string | null;
}

export interface CursorKey {
	readonly createdAt: Date;
	readonly id: string;
}
