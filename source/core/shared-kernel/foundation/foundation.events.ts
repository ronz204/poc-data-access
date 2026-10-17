export interface DomainEvent<T extends string = string, P = unknown> {
	readonly type: T;
	readonly aggregateId: string;
	readonly occurredAt: Date;
	readonly payload: P;
}

export interface Changed<A, E extends DomainEvent = never> {
	readonly next: A;
	readonly events: readonly E[];
}
