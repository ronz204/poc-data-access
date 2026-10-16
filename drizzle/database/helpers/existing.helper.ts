import { pgRole, pgSchema } from "drizzle-orm/pg-core";

export const platform = pgSchema("platform").existing();
export const catalog = pgSchema("catalog").existing();
export const sales = pgSchema("sales").existing();
export const wallet = pgSchema("wallet").existing();
export const messaging = pgSchema("messaging").existing();
export const reporting = pgSchema("reporting").existing();

export const sampler = pgRole("sampler").existing();
export const runner = pgRole("runner").existing();
export const reader = pgRole("reader").existing();
export const relayer = pgRole("relayer").existing();
