import type { TokenHash } from "./invitation.vos";

export interface MintedToken {
	readonly token: string;
	readonly hash: TokenHash;
}

export interface ITokenVault {
	mint(): MintedToken;
	hash(token: string): TokenHash;
}
