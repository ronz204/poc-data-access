import { Entity, type EntityState } from "@core/shared-kernel";
import { describe, expect, it } from "vitest";

interface WidgetState extends EntityState<string> {
	readonly label: string;
	readonly size: number;
}

class Widget extends Entity<WidgetState>() {
	private constructor(state: WidgetState) {
		super(state);
	}

	static create(id: string, label: string): Widget {
		return new Widget({ id, label, size: 1 });
	}

	relabel(label: string): Widget {
		return label === this.label ? this : this.with({ label });
	}

	reidentify(id: string): Widget {
		// @ts-expect-error the identity is not part of a patch
		return this.with({ id });
	}
}

class Gadget extends Entity<WidgetState>() {}

describe("Entity base", () => {
	const state: WidgetState = { id: "w1", label: "first", size: 2 };

	it("exposes the state fields directly", () => {
		const widget = Widget.restore(state);
		expect(widget.id).toBe("w1");
		expect(widget.label).toBe("first");
		expect(widget.size).toBe(2);
	});

	it("restores an instance of the calling class", () => {
		expect(Widget.restore(state)).toBeInstanceOf(Widget);
	});

	it("is frozen at runtime", () => {
		const widget = Widget.create("w1", "first");
		expect(Object.isFrozen(widget)).toBe(true);
		expect(() => {
			(widget as { label: string }).label = "changed";
		}).toThrow(TypeError);
	});

	it("does not keep a reference to the state object it was given", () => {
		const input = { ...state };
		const widget = Widget.restore(input);
		input.label = "mutated";
		expect(widget.label).toBe("first");
	});

	it("rejects a subclass that declares its own fields, because the base freezes the instance", () => {
		class Fielded extends Entity<WidgetState>() {
			readonly extra = 1;
		}
		expect(() => Fielded.restore(state)).toThrow(TypeError);
	});

	describe("with", () => {
		it("returns a new instance of the same class with the patch applied", () => {
			const original = Widget.create("w1", "first");
			const next = original.relabel("second");
			expect(next).not.toBe(original);
			expect(next).toBeInstanceOf(Widget);
			expect(next.label).toBe("second");
			expect(next.size).toBe(1);
			expect(next.id).toBe("w1");
		});

		it("leaves the receiver untouched", () => {
			const original = Widget.create("w1", "first");
			original.relabel("second");
			expect(original.label).toBe("first");
		});

		it("lets an operation return the receiver when nothing changes", () => {
			const original = Widget.create("w1", "first");
			expect(original.relabel("first")).toBe(original);
		});
	});

	describe("sameAs", () => {
		it("is true for two restores of the same row", () => {
			expect(Widget.restore(state).sameAs(Widget.restore({ ...state, label: "other" }))).toBe(true);
		});

		it("is false for a different id", () => {
			expect(Widget.restore(state).sameAs(Widget.restore({ ...state, id: "w2" }))).toBe(false);
		});

		it("is false for a different class with the same id", () => {
			expect(Widget.restore(state).sameAs(Gadget.restore(state))).toBe(false);
		});
	});
});
