import { pino } from "pino";

/**
 * Never log message contents or secrets. `redact` is a safety net for any
 * token-like field that ends up in a log object by mistake.
 */
export const logger = pino({
  level: "info",
  redact: {
    paths: ["token", "*.token", "authorization", "*.authorization", "headers.authorization", "*.headers.authorization"],
    censor: "[REDACTED]",
  },
});

/**
 * Reduce an error to fields that are safe to log. discord.js API errors carry
 * the request body (which contains message text), so they are never logged whole.
 */
export function safeError(error: unknown): { name: string; message: string; code?: string | number } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return {
      name: error.name,
      message: error.message,
      ...(typeof code === "string" || typeof code === "number" ? { code } : {}),
    };
  }
  return { name: "UnknownError", message: String(error) };
}
