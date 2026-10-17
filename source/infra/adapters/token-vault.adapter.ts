import { type ITokenVault, type MintedToken, TokenHash } from "@core/identity-access";
import { createHash, randomBytes } from "node:crypto";

export class TokenVaultAdapter implements ITokenVault {
	mint(): MintedToken {
		const token = randomBytes(32).toString("base64url");
		return { token, hash: this.hash(token) };
	}

	hash(token: string): TokenHash {
		return TokenHash.parse(createHash("sha256").update(token).digest("hex"));
	}
}
