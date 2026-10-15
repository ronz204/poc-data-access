import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import postgres from "postgres";
import { z } from "zod";

const env = z
  .object({
    POSTGRES_SAMPLER_URL: z.url(),
    POSTGRES_RUNNER_URL: z.url(),
    POSTGRES_RELAYER_URL: z.url(),
  })
  .parse(Bun.env);

const connect = (url: string) => postgres(url, { max: 1, onnotice: () => {} });

const clients = {
  sampler: connect(env.POSTGRES_SAMPLER_URL),
  runner: connect(env.POSTGRES_RUNNER_URL),
  relayer: connect(env.POSTGRES_RELAYER_URL),
};

const WRITE = ["DELETE", "INSERT", "SELECT", "UPDATE"];
const APPEND = ["INSERT", "SELECT"];
const READ = ["SELECT"];
const NONE: string[] = [];

const expectedGrants = {
  platform: { runner: WRITE, relayer: NONE },
  catalog: { runner: WRITE, relayer: NONE },
  sales: { runner: WRITE, relayer: NONE },
  messaging: { runner: WRITE, relayer: ["SELECT", "UPDATE"] },
  wallet: { runner: APPEND, relayer: NONE },
  audit: { runner: APPEND, relayer: NONE },
  reporting: { runner: READ, relayer: NONE },
  drizzle: { runner: NONE, relayer: NONE },
};

const attributes = (bypassrls: boolean) => ({
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: bypassrls,
  rolcanlogin: true,
});

const expectedRoles = [
  { rolname: "relayer", ...attributes(true) },
  { rolname: "runner", ...attributes(false) },
  { rolname: "sampler", ...attributes(false) },
];

const INSUFFICIENT_PRIVILEGE = { code: "42501" };
const INVALID_PASSWORD = { code: "28P01" };

class Rollback extends Error {}

const probe = async (work: (tx: postgres.TransactionSql) => Promise<void>) => {
  try {
    await clients.sampler.begin(async (tx) => {
      await work(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
};

const tablePrivileges = async (tx: postgres.TransactionSql, role: string, table: string) => {
  const rows = await tx<{ privilege: string }[]>`
    SELECT privilege
    FROM unnest(ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']) AS privilege
    WHERE has_table_privilege(${role}, ${table}, privilege)
    ORDER BY privilege`;
  return rows.map((row) => row.privilege);
};

const checks: Array<[string, () => Promise<void>]> = [];
const check = (name: string, run: () => Promise<void>) => checks.push([name, run]);

check("every role connects with its own password", async () => {
  for (const [role, client] of Object.entries(clients)) {
    const [row] = await client<{ name: string }[]>`SELECT current_user AS name`;
    strictEqual(row?.name, role);
  }
});

check("a wrong password is rejected", async () => {
  const url = new URL(env.POSTGRES_RUNNER_URL);
  url.password = "wrong";
  const intruder = connect(url.href);
  await rejects(intruder`SELECT 1`, INVALID_PASSWORD);
  await intruder.end();
});

check("roles carry only the intended attributes", async () => {
  const rows = await clients.sampler`
    SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls, rolcanlogin
    FROM pg_roles
    WHERE rolname IN ('sampler', 'runner', 'relayer')
    ORDER BY rolname`;
  deepStrictEqual(rows.map((row) => ({ ...row })), expectedRoles);
});

check("sampler owns every schema", async () => {
  const rows = await clients.sampler<{ name: string }[]>`
    SELECT schema_name AS name
    FROM information_schema.schemata
    WHERE schema_owner = 'sampler'
    ORDER BY schema_name`;
  deepStrictEqual(rows.map((row) => row.name), Object.keys(expectedGrants).sort());
});

check("runner cannot create objects", async () => {
  await rejects(clients.runner`CREATE TABLE catalog.intruder (id int)`, INSUFFICIENT_PRIVILEGE);
  await rejects(clients.runner`CREATE TABLE public.intruder (id int)`, INSUFFICIENT_PRIVILEGE);
  await rejects(clients.runner`CREATE SCHEMA intruder`, INSUFFICIENT_PRIVILEGE);
});

for (const [schema, expected] of Object.entries(expectedGrants)) {
  check(`new tables in ${schema} follow the default grants`, () =>
    probe(async (tx) => {
      await tx`CREATE TABLE ${tx(schema)}.probe (id int)`;
      deepStrictEqual(await tablePrivileges(tx, "runner", `${schema}.probe`), expected.runner);
      deepStrictEqual(await tablePrivileges(tx, "relayer", `${schema}.probe`), expected.relayer);
    }),
  );
}

check("new functions are not executable by the application roles", () =>
  probe(async (tx) => {
    await tx`CREATE FUNCTION catalog.probe() RETURNS int LANGUAGE sql AS 'SELECT 1'`;
    const [row] = await tx<{ runner: boolean; relayer: boolean }[]>`
      SELECT
        has_function_privilege('runner', 'catalog.probe()', 'EXECUTE') AS runner,
        has_function_privilege('relayer', 'catalog.probe()', 'EXECUTE') AS relayer`;
    deepStrictEqual({ ...row }, { runner: false, relayer: false });
  }),
);

let failed = 0;
for (const [name, run] of checks) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}\n${error}`);
  }
}

await Promise.all(Object.values(clients).map((client) => client.end()));
process.exitCode = failed ? 1 : 0;
