import { extractUrls } from "./extract.js";
import { stripTrackingParams } from "./tracking.js";

export interface Rule {
  /** Validated, normalized hostname to match. */
  from: string;
  /** Validated, normalized hostname to replace it with. */
  to: string;
}

/** Rules prepared for matching: most specific `from` first. */
export interface RuleSet {
  rules: readonly Rule[];
}

/** Most links fixed per message. */
export const MAX_FIXED_PER_MESSAGE = 5;

/**
 * Subdomains a rule also matches. Anything else (e.g. help.x.com,
 * about.instagram.com) is a different site and is left alone; add an explicit
 * rule for it if needed.
 *  - DROPPED: same content as the bare domain, so the replacement uses the bare target.
 *  - KEPT: short-link hosts the replacement services mirror (vm.tiktok.com → vm.vxtiktok.com).
 */
const DROPPED_SUBDOMAINS = new Set(["www", "m", "mobile", "old", "new"]);
const KEPT_SUBDOMAINS = new Set(["vm", "vt"]);

export function buildRuleSet(rules: readonly Rule[]): RuleSet {
  return { rules: [...rules].sort((a, b) => b.from.length - a.from.length) };
}

/**
 * Effective rules for a server: the global defaults, minus the ones the server
 * disabled, with the server's custom rules overriding defaults on the same `from`.
 */
export function resolveRules(
  defaults: readonly Rule[],
  disabledDefaults: ReadonlySet<string>,
  custom: readonly Rule[],
): Rule[] {
  const byFrom = new Map<string, Rule>();
  for (const rule of defaults) {
    if (!disabledDefaults.has(rule.from)) byFrom.set(rule.from, rule);
  }
  for (const rule of custom) byFrom.set(rule.from, rule);
  return [...byFrom.values()];
}

/**
 * Returns the host a rule would produce for `host`, or null if the rule
 * doesn't apply. Exact or allowed-subdomain matches only, never substrings.
 */
function matchRule(host: string, rule: Rule): string | null {
  if (host === rule.from) return rule.to;
  if (!host.endsWith(`.${rule.from}`)) return null;
  const sub = host.slice(0, -(rule.from.length + 1));
  if (DROPPED_SUBDOMAINS.has(sub)) return rule.to;
  if (KEPT_SUBDOMAINS.has(sub)) return `${sub}.${rule.to}`;
  return null;
}

/** True when some rule would rewrite links on `host`. */
export function ruleSetMatchesHost(ruleSet: RuleSet, host: string): boolean {
  return ruleSet.rules.some((rule) => matchRule(host, rule) !== null);
}

/** Returns the rewritten URL, or null if no rule applies. */
export function rewriteUrl(raw: string, ruleSet: RuleSet): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;

  const host = url.hostname.endsWith(".") ? url.hostname.slice(0, -1) : url.hostname;

  for (const rule of ruleSet.rules) {
    const target = matchRule(host, rule);
    if (target) {
      // Only the host changes (ports are dropped), plus tracking parameters are removed.
      return `https://${target}${url.pathname}${stripTrackingParams(url, host)}${url.hash}`;
    }
  }
  return null;
}

/** Rewrites eligible links in a message, deduplicated, in order, at most MAX_FIXED_PER_MESSAGE. */
export function rewriteContent(content: string, ruleSet: RuleSet): string[] {
  const results = new Set<string>();
  for (const raw of extractUrls(content)) {
    const fixed = rewriteUrl(raw, ruleSet);
    if (fixed) results.add(fixed);
    if (results.size >= MAX_FIXED_PER_MESSAGE) break;
  }
  return [...results];
}

/** Cheap pre-check: does the message mention any rule domain at all? */
export function mightContainRuleDomain(content: string, ruleSet: RuleSet): boolean {
  const lower = content.toLowerCase();
  return ruleSet.rules.some((rule) => rule.from.includes("xn--") || lower.includes(rule.from));
}
