import { z } from "zod";
import { logger } from "./logger.js";

const snowflake = z.string().regex(/^\d{17,20}$/, "must be a Discord ID (17-20 digits)");

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "is required"),
  DISCORD_CLIENT_ID: snowflake,
  DEV_GUILD_ID: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(snowflake.optional()),
  DATABASE_PATH: z
    .string()
    .optional()
    .transform((v) => v || "./data/bot.db"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent", ""])
    .optional()
    .transform((v) => v || "info"),
  RULES_PATH: z
    .string()
    .optional()
    .transform((v) => v || "./config/rules.json"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Loads `.env` (if present) and validates the environment. The token is
 * removed from `process.env` afterwards so it can't leak through child
 * processes or accidental environment dumps.
 */
export function loadEnv(): Env {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file: variables come from the real environment (e.g. Docker env_file).
  }

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee .env.example.`);
  }

  delete process.env.DISCORD_TOKEN;
  // .env is loaded after the logger is created, so apply the level here.
  logger.level = parsed.data.LOG_LEVEL;
  return parsed.data;
}
