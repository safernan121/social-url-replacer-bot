import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Rule } from "./rewrite.js";

export type ReplyMode = "reply" | "reply_suppress";
export const REPLY_MODES: readonly ReplyMode[] = ["reply", "reply_suppress"];

export interface GuildConfig {
  enabled: boolean;
  mode: ReplyMode;
  customRules: Rule[];
  disabledDefaults: Set<string>;
}

const DEFAULT_MODE: ReplyMode = "reply_suppress";

/**
 * Per-server settings. Only server IDs and domains are stored; never message
 * content or user IDs. All queries are prepared statements with bound
 * parameters.
 */
export class Store {
  private readonly db: Database.Database;
  private readonly cache = new Map<string, GuildConfig>();
  private readonly stmts: ReturnType<Store["prepare"]>;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path);
    // Only the bot's user may read the database (it may already exist with looser permissions).
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();

    this.stmts = this.prepare();
  }

  /** Schema changes are applied in order, tracked by SQLite's user_version. */
  private migrate(): void {
    const migrations: string[] = [
      `
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        enabled  INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        mode     TEXT    NOT NULL DEFAULT '${DEFAULT_MODE}' CHECK (mode IN ('reply', 'reply_suppress'))
      );
      CREATE TABLE IF NOT EXISTS guild_rules (
        guild_id  TEXT NOT NULL,
        from_host TEXT NOT NULL,
        to_host   TEXT NOT NULL,
        PRIMARY KEY (guild_id, from_host)
      );
      CREATE TABLE IF NOT EXISTS guild_disabled_defaults (
        guild_id  TEXT NOT NULL,
        from_host TEXT NOT NULL,
        PRIMARY KEY (guild_id, from_host)
      );
    `,
    ];
    const current = this.db.pragma("user_version", { simple: true }) as number;
    for (let version = current; version < migrations.length; version++) {
      this.db.transaction(() => {
        this.db.exec(migrations[version] ?? "");
        this.db.pragma(`user_version = ${version + 1}`);
      })();
    }
  }

  private prepare() {
    return {
      getSettings: this.db.prepare<[string], { enabled: number; mode: ReplyMode }>(
        "SELECT enabled, mode FROM guild_settings WHERE guild_id = ?",
      ),
      getRules: this.db.prepare<[string], { from_host: string; to_host: string }>(
        "SELECT from_host, to_host FROM guild_rules WHERE guild_id = ? ORDER BY from_host",
      ),
      getDisabled: this.db.prepare<[string], { from_host: string }>(
        "SELECT from_host FROM guild_disabled_defaults WHERE guild_id = ?",
      ),
      setEnabled: this.db.prepare<[string, number]>(
        `INSERT INTO guild_settings (guild_id, enabled) VALUES (?, ?)
         ON CONFLICT (guild_id) DO UPDATE SET enabled = excluded.enabled`,
      ),
      setMode: this.db.prepare<[string, string]>(
        `INSERT INTO guild_settings (guild_id, mode) VALUES (?, ?)
         ON CONFLICT (guild_id) DO UPDATE SET mode = excluded.mode`,
      ),
      upsertRule: this.db.prepare<[string, string, string]>(
        `INSERT INTO guild_rules (guild_id, from_host, to_host) VALUES (?, ?, ?)
         ON CONFLICT (guild_id, from_host) DO UPDATE SET to_host = excluded.to_host`,
      ),
      deleteRule: this.db.prepare<[string, string]>(
        "DELETE FROM guild_rules WHERE guild_id = ? AND from_host = ?",
      ),
      disableDefault: this.db.prepare<[string, string]>(
        "INSERT OR IGNORE INTO guild_disabled_defaults (guild_id, from_host) VALUES (?, ?)",
      ),
      enableDefault: this.db.prepare<[string, string]>(
        "DELETE FROM guild_disabled_defaults WHERE guild_id = ? AND from_host = ?",
      ),
      deleteSettings: this.db.prepare<[string]>("DELETE FROM guild_settings WHERE guild_id = ?"),
      deleteRules: this.db.prepare<[string]>("DELETE FROM guild_rules WHERE guild_id = ?"),
      deleteDisabled: this.db.prepare<[string]>("DELETE FROM guild_disabled_defaults WHERE guild_id = ?"),
      guildIds: this.db.prepare<[], { guild_id: string }>(
        `SELECT guild_id FROM guild_settings UNION SELECT guild_id FROM guild_rules
         UNION SELECT guild_id FROM guild_disabled_defaults`,
      ),
    };
  }

  getGuildConfig(guildId: string): GuildConfig {
    const cached = this.cache.get(guildId);
    if (cached) return cached;

    const settings = this.stmts.getSettings.get(guildId);
    const config: GuildConfig = {
      enabled: settings ? settings.enabled === 1 : true,
      mode: settings?.mode ?? DEFAULT_MODE,
      customRules: this.stmts.getRules.all(guildId).map((r) => ({ from: r.from_host, to: r.to_host })),
      disabledDefaults: new Set(this.stmts.getDisabled.all(guildId).map((r) => r.from_host)),
    };
    this.cache.set(guildId, config);
    return config;
  }

  setEnabled(guildId: string, enabled: boolean): void {
    this.stmts.setEnabled.run(guildId, enabled ? 1 : 0);
    this.cache.delete(guildId);
  }

  setMode(guildId: string, mode: ReplyMode): void {
    this.stmts.setMode.run(guildId, mode);
    this.cache.delete(guildId);
  }

  upsertRule(guildId: string, rule: Rule): void {
    this.stmts.upsertRule.run(guildId, rule.from, rule.to);
    this.cache.delete(guildId);
  }

  /** Returns true if a rule was removed. */
  removeRule(guildId: string, from: string): boolean {
    const changes = this.stmts.deleteRule.run(guildId, from).changes;
    this.cache.delete(guildId);
    return changes > 0;
  }

  setDefaultDisabled(guildId: string, from: string, disabled: boolean): void {
    if (disabled) this.stmts.disableDefault.run(guildId, from);
    else this.stmts.enableDefault.run(guildId, from);
    this.cache.delete(guildId);
  }

  /** Removes everything stored for a server (used by /fixlinks reset and when the bot leaves). */
  deleteGuild(guildId: string): void {
    this.db.transaction(() => {
      this.stmts.deleteSettings.run(guildId);
      this.stmts.deleteRules.run(guildId);
      this.stmts.deleteDisabled.run(guildId);
    })();
    this.cache.delete(guildId);
  }

  /** Every server that has stored settings. */
  listGuildIds(): string[] {
    return this.stmts.guildIds.all().map((r) => r.guild_id);
  }

  close(): void {
    this.db.close();
  }
}
