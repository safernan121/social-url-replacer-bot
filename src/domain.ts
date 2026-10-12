/**
 * Hostname validation for rule domains. Every rule `from`/`to` (from the
 * config file or from a slash command) goes through `validateRuleHost`, so a
 * rule can only ever be a plain registrable-looking hostname: no schemes,
 * paths, ports, credentials, IPs, wildcards or markdown.
 */

export type HostResult = { ok: true; host: string } | { ok: false; reason: string };

const MAX_HOST_LENGTH = 253;
const LABEL_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
// Anything that would make the input more than a bare hostname.
const FORBIDDEN_CHARS_RE = /[\s/\\:?#@*%[\]<>|`"'(){}!$&+,;=~^]/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Lowercase, trim, convert IDNs to punycode and drop a trailing dot. */
export function normalizeHost(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_HOST_LENGTH) return null;
  try {
    const host = new URL(`http://${trimmed}`).hostname;
    return host.endsWith(".") ? host.slice(0, -1) : host;
  } catch {
    return null;
  }
}

export function validateRuleHost(input: string): HostResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { ok: false, reason: "Domain is empty." };
  if (trimmed.length > MAX_HOST_LENGTH) return { ok: false, reason: "Domain is too long." };
  if (FORBIDDEN_CHARS_RE.test(trimmed)) {
    return {
      ok: false,
      reason: "Use a bare domain like `example.com` (no `https://`, paths, ports or spaces).",
    };
  }

  const host = normalizeHost(trimmed);
  if (!host || host.length > MAX_HOST_LENGTH) return { ok: false, reason: "Not a valid domain." };

  // The URL parser turns things like `0x7f.1` or `2130706433` into IPv4 addresses.
  if (IPV4_RE.test(host) || host.includes(":")) {
    return { ok: false, reason: "IP addresses are not allowed." };
  }

  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, reason: "Domain must contain a dot, like `example.com`." };
  if (!labels.every((label) => LABEL_RE.test(label))) {
    return { ok: false, reason: "Domain contains invalid characters." };
  }
  const tld = labels[labels.length - 1] ?? "";
  if (!/[a-z]/.test(tld)) return { ok: false, reason: "Not a valid domain." };
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return { ok: false, reason: "Local domains are not allowed." };
  }

  return { ok: true, host };
}

/** True when `host` is `domain` itself or a subdomain of it. Never a substring match. */
export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}
