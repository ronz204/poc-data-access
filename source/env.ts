import { z } from "zod";

const schema = z.object({
  POSTGRES_SAMPLER_URL: z.url(),
  POSTGRES_RUNNER_URL: z.url(),
  POSTGRES_RELAYER_URL: z.url(),
});

export const env = schema.parse(Bun.env);
