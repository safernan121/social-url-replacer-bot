import type { BotConfig } from "./config.js";
import type { RateLimiter } from "./rateLimit.js";
import { buildRuleSet, resolveRules, type RuleSet } from "./rewrite.js";
import type { GuildConfig, Store } from "./store.js";

/** Shared dependencies passed to the event handlers. */
export interface BotContext {
  config: BotConfig;
  store: Store;
  rateLimiter: RateLimiter;
}

export function effectiveRuleSet(config: BotConfig, guild: GuildConfig): RuleSet {
  return buildRuleSet(resolveRules(config.defaults, guild.disabledDefaults, guild.customRules));
}
