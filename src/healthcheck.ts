import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { heartbeatPath, isHeartbeatFresh } from "./health.js";

/**
 * Exit code 0 if the running bot is connected to Discord, 1 otherwise. Used by
 * Docker's HEALTHCHECK; can also be run by hand: `npm run healthcheck`.
 * Only HEARTBEAT_PATH is taken from `.env`; the token is never loaded.
 */
if (!process.env.HEARTBEAT_PATH) {
  try {
    const fromFile = parseEnv(readFileSync(".env", "utf8")).HEARTBEAT_PATH;
    if (fromFile) process.env.HEARTBEAT_PATH = fromFile;
  } catch {
    // No .env file: use the default path.
  }
}

let healthy = false;
try {
  healthy = isHeartbeatFresh(readFileSync(heartbeatPath(), "utf8"), Date.now());
} catch {
  // No heartbeat file yet: the bot hasn't connected.
}
process.stdout.write(healthy ? "healthy\n" : "unhealthy\n");
process.exit(healthy ? 0 : 1);
