import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3002),
  HOST: z.string().min(1).default("0.0.0.0"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  ANTHROPIC_BASE_URL_OVERRIDE: z.string().url().optional(),
  MAX_MCP_OUTPUT_TOKENS: z.coerce.number().int().positive().default(30_000),
  LOG_LEVEL: z.string().min(1).default("info"),
  CLAUDE_PROVIDER: z.string().min(1).default("anthropic"),
  DAYTONA_API_KEY: z.string().min(1).optional(),
  DAYTONA_TARGET: z.string().min(1).default("us"),
  BROWSER_USE_CDP_URL: z.string().optional(),
});

const normalizedEnv = {
  ...process.env,
  ANTHROPIC_API_KEY:
    process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_CODE_SERVER_ANTHROPIC_API_KEY,
};

const parsedEnv = EnvSchema.safeParse(normalizedEnv);

if (!parsedEnv.success) {
  throw new Error(
    `Invalid environment configuration: ${z.prettifyError(parsedEnv.error)}\n` +
      "Set ANTHROPIC_API_KEY (or CLAUDE_CODE_SERVER_ANTHROPIC_API_KEY).",
  );
}

const env = parsedEnv.data;

export const config = {
  server: {
    port: env.PORT,
    host: env.HOST,
  },
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
    baseUrlOverride: env.ANTHROPIC_BASE_URL_OVERRIDE,
    provider: env.CLAUDE_PROVIDER,
  },
  execution: {
    maxMcpOutputTokens: env.MAX_MCP_OUTPUT_TOKENS,
  },
  daytona: {
    apiKey: env.DAYTONA_API_KEY,
    target: env.DAYTONA_TARGET,
  },
  browserUse: {
    cdpUrl: env.BROWSER_USE_CDP_URL,
  },
  logLevel: env.LOG_LEVEL,
} as const;

export type Config = typeof config;
