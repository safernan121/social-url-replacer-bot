/**
 * Finds the links in a message that Discord would normally embed. Links the
 * author deliberately hid or un-embedded are left alone:
 *   - code blocks (```...```) and inline code (`...`)
 *   - spoilers (||...||)
 *   - suppressed links (<https://...>)
 */

export const MAX_CONTENT_LENGTH = 4000;
/** Candidate links considered per message (the reply itself is capped separately). */
export const MAX_CANDIDATE_URLS = 20;
export const MAX_URL_LENGTH = 1024;

const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]*`/g;
const SPOILER_RE = /\|\|[\s\S]*?\|\|/g;
const SUPPRESSED_LINK_RE = /<https?:\/\/[^\s>]*>/gi;
// Stops at characters that can't sensibly be part of a pasted link, including
// `[`/`]` (markdown link text) and `\` (markdown escapes). Bounded length so a
// pathological message can't make matching expensive.
const URL_RE = new RegExp(`https?://[^\\s<>|\`"\\\\\\[\\]]{1,${MAX_URL_LENGTH}}`, "gi");
// `_` is deliberately not trimmed: usernames can end with it.
const TRAILING_PUNCTUATION = new Set([".", ",", "!", "?", ";", ":", "'", "*", "~", "}", ">"]);

/** Trims trailing punctuation and unbalanced `)` in a single linear pass. */
function trimTrailing(url: string): string {
  let opens = 0;
  let closes = 0;
  for (const ch of url) {
    if (ch === "(") opens++;
    else if (ch === ")") closes++;
  }

  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    if (ch === ")" && closes > opens) {
      closes--;
      end--;
    } else if (ch !== undefined && TRAILING_PUNCTUATION.has(ch)) {
      end--;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

export function extractUrls(content: string): string[] {
  if (content.length === 0 || content.length > MAX_CONTENT_LENGTH) return [];

  const visible = content
    .replace(CODE_BLOCK_RE, " ")
    .replace(INLINE_CODE_RE, " ")
    .replace(SPOILER_RE, " ")
    .replace(SUPPRESSED_LINK_RE, " ");

  const found = new Set<string>();
  for (const match of visible.matchAll(URL_RE)) {
    const url = trimTrailing(match[0]);
    if (url.length > "https://".length) found.add(url);
    if (found.size >= MAX_CANDIDATE_URLS) break;
  }
  return [...found];
}
