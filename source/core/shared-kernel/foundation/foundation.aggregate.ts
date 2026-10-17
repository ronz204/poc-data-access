export interface EntityState<I> {
	readonly id: I;
}

export interface Versioned {
	readonly version: number;
}

export interface Timestamped {
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface SoftDeleted {
	readonly deletedAt: Date | null;
}

export interface Restorable<S> {
	restore<T>(this: { readonly prototype: T }, state: S): T;
}

export function Entity<S extends EntityState<unknown>>() {
	abstract class StateEntity {
		constructor(state: S) {
			Object.assign(this, state);
			Object.freeze(this);
		}

		static restore<T>(this: { readonly prototype: T }, state: S): T {
			const Self = this as unknown as new (state: S) => T;
			return new Self(state);
		}

		sameAs(other: StateEntity): boolean {
			return this.constructor === other.constructor && this.state.id === other.state.id;
		}

		protected with(patch: Partial<S>): this {
			const Self = this.constructor as new (state: S) => this;
			return new Self({ ...this.state, ...patch });
		}

		private get state(): S {
			return this as unknown as S;
		}
	}

	return StateEntity as unknown as (abstract new (state: S) => StateEntity & Readonly<S>) & Restorable<S>;
}

export function Aggregate<S extends EntityState<unknown>>() {
	return Entity<S>();
}
