import { TokenVaultAdapter } from "@infra/adapters/token-vault.adapter";
import { describe, expect, it } from "vitest";

describe("TokenVaultAdapter", () => {
	const vault = new TokenVaultAdapter();

	it("mints distinct high-entropy url-safe tokens", () => {
		const [first, second] = [vault.mint(), vault.mint()];
		expect(first.token).not.toBe(second.token);
		expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("returns the hash of the token it minted, never the token itself", () => {
		const { token, hash } = vault.mint();
		expect(hash).toBe(vault.hash(token));
		expect(hash).not.toContain(token);
	});

	it("hashes a token to a stable sha-256 hex digest", () => {
		expect(vault.hash("secret")).toBe("2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b");
		expect(vault.hash("secret")).not.toBe(vault.hash("Secret"));
	});
});
