import { readFileSync } from "node:fs";
import { z } from "zod";
import { validateRuleHost } from "./domain.js";
import { buildRuleSet, ruleSetMatchesHost, type Rule } from "./rewrite.js";

export interface BotConfig {
  defaults: Rule[];
  policy: {
    maxCustomRulesPerGuild: number;
    /**
     * Domains server admins may use as replacement targets (always includes the
     * default rules' targets). null = any domain.
     */
    allowedCustomTargets: ReadonlySet<string> | null;
  };
}

const host = z.string().transform((value, ctx) => {
  const result = validateRuleHost(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: `"${value}": ${result.reason}` });
    return z.NEVER;
  }
  return result.host;
});

const ConfigSchema = z
  .object({
    rules: z.array(z.object({ from: host, to: host }).strict()).max(200),
    policy: z
      .object({
        maxCustomRulesPerGuild: z.number().int().min(0).max(100).default(25),
        // Secure default: when omitted, only the default rules' targets are allowed.
        allowedCustomTargets: z.array(host).max(500).nullable().default([]),
      })
      .strict()
      .default({ maxCustomRulesPerGuild: 25, allowedCustomTargets: [] }),
  })
  .strict()
  .superRefine((config, ctx) => {
    const seen = new Set<string>();
    for (const rule of config.rules) {
      if (rule.from === rule.to) {
        ctx.addIssue({ code: "custom", message: `Rule "${rule.from}" points to itself.` });
      }
      if (seen.has(rule.from)) {
        ctx.addIssue({ code: "custom", message: `Duplicate rule for "${rule.from}".` });
      }
      seen.add(rule.from);
    }
    const ruleSet = buildRuleSet(config.rules);
    for (const rule of config.rules) {
      if (ruleSetMatchesHost(ruleSet, rule.to)) {
        ctx.addIssue({ code: "custom", message: `Rule target "${rule.to}" is itself rewritten by another rule.` });
      }
    }
  });

export function parseConfig(raw: unknown): BotConfig {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid rules config:\n${problems}`);
  }
  const { rules, policy } = parsed.data;
  return {
    defaults: rules,
    policy: {
      maxCustomRulesPerGuild: policy.maxCustomRulesPerGuild,
      allowedCustomTargets: policy.allowedCustomTargets
        ? new Set([...policy.allowedCustomTargets, ...rules.map((r) => r.to)])
        : null,
    },
  };
}

export function loadConfig(path: string): BotConfig {
  return parseConfig(JSON.parse(readFileSync(path, "utf8")));
}
