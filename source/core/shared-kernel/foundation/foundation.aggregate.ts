export function Aggregate<S extends object>() {
	abstract class StateAggregate {
		constructor(state: S) {
			Object.assign(this, state);
			Object.freeze(this);
		}

		protected with(patch: Partial<S>): this {
			const Self = this.constructor as new (state: S) => this;
			return new Self({ ...(this as unknown as S), ...patch });
		}
	}

	return StateAggregate as unknown as abstract new (
		state: S,
	) => StateAggregate & Readonly<S>;
}
