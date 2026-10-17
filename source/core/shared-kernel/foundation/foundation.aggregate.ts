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

export type Patch<S extends EntityState<unknown>> = Partial<Omit<S, "id">>;

function idOf(entity: object): unknown {
	return (entity as EntityState<unknown>).id;
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
			return this.constructor === other.constructor && idOf(this) === idOf(other);
		}

		protected with(patch: Patch<S>): this {
			const Self = this.constructor as new (state: S) => this;
			return new Self({ ...(this as unknown as S), ...patch });
		}
	}

	return StateEntity as unknown as (abstract new (state: S) => StateEntity & Readonly<S>) & Restorable<S>;
}
