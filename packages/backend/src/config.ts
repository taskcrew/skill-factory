import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  ANTHROPIC_BASE_URL_OVERRIDE: z.string().url().optional(),
  DAYTONA_API_KEY: z.string().min(1, "DAYTONA_API_KEY is required"),
  DAYTONA_TARGET: z.string().min(1).default("us"),
  LOG_LEVEL: z.string().min(1).default("info"),
});

const parsedEnv = EnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(
    `Invalid environment configuration: ${z.prettifyError(parsedEnv.error)}\n` +
      "Required: ANTHROPIC_API_KEY, DAYTONA_API_KEY",
  );
}

const env = parsedEnv.data;

export const config = {
  port: env.PORT,
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
    baseUrlOverride: env.ANTHROPIC_BASE_URL_OVERRIDE,
  },
  daytona: {
    apiKey: env.DAYTONA_API_KEY,
    target: env.DAYTONA_TARGET,
  },
  logLevel: env.LOG_LEVEL,
} as const;

export type Config = typeof config;
