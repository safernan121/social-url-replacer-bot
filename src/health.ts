import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Client, Status } from "discord.js";
import { logger, safeError } from "./logger.js";

/**
 * Health monitoring without opening a network port:
 *  - While connected to Discord, the bot writes the current time to a
 *    heartbeat file. `healthcheck.ts` (run by Docker's HEALTHCHECK) reports
 *    unhealthy when that file goes stale.
 *  - If the bot stays disconnected for too long, it exits with an error so
 *    Docker / pm2 / systemd restart it. discord.js reconnects on its own, so
 *    this only triggers when it gets stuck.
 */
/** Read lazily, so a value from `.env` (loaded at startup) is respected. */
export function heartbeatPath(): string {
  return process.env.HEARTBEAT_PATH || join(tmpdir(), "social-url-replacer-bot.heartbeat");
}
export const HEARTBEAT_INTERVAL_MS = 15_000;
/** Heartbeats older than this mean unhealthy. */
export const HEARTBEAT_MAX_AGE_MS = 60_000;
/** Disconnected (or never connected) for longer than this → exit and get restarted. */
export const MAX_UNHEALTHY_MS = 5 * 60_000;

export function isConnected(client: Client): boolean {
  return client.isReady() && client.ws.status === Status.Ready;
}

/** True if the heartbeat file content is a timestamp no older than maxAgeMs. */
export function isHeartbeatFresh(content: string, now: number, maxAgeMs = HEARTBEAT_MAX_AGE_MS): boolean {
  const trimmed = content.trim();
  if (!/^\d{1,16}$/.test(trimmed)) return false;
  const timestamp = Number(trimmed);
  const age = now - timestamp;
  return age >= 0 && age <= maxAgeMs;
}

export class HealthMonitor {
  private lastHealthy: number;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly checkConnected: () => boolean,
    private readonly onUnhealthy: () => void,
    private readonly writeHeartbeat: (timestamp: number) => void = (timestamp) =>
      writeFileSync(heartbeatPath(), String(timestamp), { mode: 0o600 }),
    now = Date.now(),
  ) {
    // Startup counts as healthy, so login gets the same grace period as a reconnect.
    this.lastHealthy = now;
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), HEARTBEAT_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  tick(now = Date.now()): void {
    if (this.checkConnected()) {
      this.lastHealthy = now;
      try {
        this.writeHeartbeat(now);
      } catch (error) {
        logger.warn({ err: safeError(error), path: heartbeatPath() }, "Could not write heartbeat file");
      }
      return;
    }
    if (now - this.lastHealthy > MAX_UNHEALTHY_MS) {
      logger.error({ disconnectedForMs: now - this.lastHealthy }, "Not connected to Discord for too long, exiting");
      this.stop();
      this.onUnhealthy();
    }
  }
}
