import * as pg from "drizzle-orm/pg-core";

export const core = pg.pgSchema("core").existing();
export const runner = pg.pgRole("runner").existing();
export const sampler = pg.pgRole("sampler").existing();
