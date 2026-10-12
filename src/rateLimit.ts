/**
 * In-memory limits on how often the bot replies. They stop a single user, a
 * single server, or a coordinated flood across servers from making the bot
 * spam channels or exhaust its Discord API budget (which would delay replies
 * everywhere).
 */
export interface RateLimitOptions {
  userCooldownMs: number;
  channel: Window;
  guild: Window;
  global: Window;
}

interface Window {
  max: number;
  ms: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitOptions = {
  userCooldownMs: 3_000,
  channel: { max: 10, ms: 30_000 },
  guild: { max: 30, ms: 60_000 },
  // Each reply costs up to 2 API calls; Discord's global limit is 50 requests/second.
  global: { max: 50, ms: 10_000 },
};

const GLOBAL_KEY = "*";

export class RateLimiter {
  private readonly userLast = new Map<string, number>();
  private readonly channelHits = new Map<string, number[]>();
  private readonly guildHits = new Map<string, number[]>();
  private readonly globalHits = new Map<string, number[]>();

  constructor(private readonly options: RateLimitOptions = DEFAULT_RATE_LIMITS) {}

  /** True if a reply would currently be allowed. Doesn't record anything. */
  canConsume(userId: string, channelId: string, guildId: string, now = Date.now()): boolean {
    const last = this.userLast.get(userId);
    if (last !== undefined && now - last < this.options.userCooldownMs) return false;
    return (
      this.live(this.channelHits, channelId, this.options.channel, now).length < this.options.channel.max &&
      this.live(this.guildHits, guildId, this.options.guild, now).length < this.options.guild.max &&
      this.live(this.globalHits, GLOBAL_KEY, this.options.global, now).length < this.options.global.max
    );
  }

  /** Records a hit and returns true if it is allowed. */
  consume(userId: string, channelId: string, guildId: string, now = Date.now()): boolean {
    if (!this.canConsume(userId, channelId, guildId, now)) return false;
    this.userLast.set(userId, now);
    this.record(this.channelHits, channelId, this.options.channel, now);
    this.record(this.guildHits, guildId, this.options.guild, now);
    this.record(this.globalHits, GLOBAL_KEY, this.options.global, now);
    return true;
  }

  /** Drops expired entries so memory stays bounded. Call periodically. */
  sweep(now = Date.now()): void {
    for (const [userId, last] of this.userLast) {
      if (now - last >= this.options.userCooldownMs) this.userLast.delete(userId);
    }
    this.sweepMap(this.channelHits, this.options.channel, now);
    this.sweepMap(this.guildHits, this.options.guild, now);
    this.sweepMap(this.globalHits, this.options.global, now);
  }

  private live(map: Map<string, number[]>, key: string, window: Window, now: number): number[] {
    const hits = map.get(key);
    if (!hits) return [];
    const start = now - window.ms;
    const live = hits.filter((t) => t > start);
    map.set(key, live);
    return live;
  }

  private record(map: Map<string, number[]>, key: string, window: Window, now: number): void {
    const hits = this.live(map, key, window, now);
    hits.push(now);
    map.set(key, hits);
  }

  private sweepMap(map: Map<string, number[]>, window: Window, now: number): void {
    for (const key of [...map.keys()]) {
      if (this.live(map, key, window, now).length === 0) map.delete(key);
    }
  }
}
