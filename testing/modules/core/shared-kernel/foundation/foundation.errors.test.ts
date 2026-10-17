import { DomainError } from "@core/shared-kernel";
import { describe, expect, it } from "vitest";

class SampleError extends DomainError.define({
	first: "the first thing went wrong",
	second: "the second thing went wrong",
}) {}

describe("DomainError.define", () => {
	it("fixes the message per code", () => {
		expect(new SampleError("first").message).toBe("the first thing went wrong");
		expect(new SampleError("second").message).toBe("the second thing went wrong");
	});

	it("carries the code and structured details", () => {
		const error = new SampleError("first", { limit: 3, strict: true, hint: null });
		expect(error.code).toBe("first");
		expect(error.details).toEqual({ limit: 3, strict: true, hint: null });
	});

	it("defaults the details to empty", () => {
		expect(new SampleError("second").details).toEqual({});
	});

	it("is named after the concrete class", () => {
		expect(new SampleError("first").name).toBe("SampleError");
	});

	it("is an Error and a DomainError", () => {
		const error = new SampleError("first");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(DomainError);
		expect(error).toBeInstanceOf(SampleError);
	});

	it("keeps two defined errors distinct", () => {
		class OtherError extends DomainError.define({ first: "other" }) {}
		expect(new OtherError("first")).not.toBeInstanceOf(SampleError);
	});
});
