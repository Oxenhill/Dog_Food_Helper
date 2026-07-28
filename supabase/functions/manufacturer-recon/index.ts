import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Recon-only pass over manufacturer_target_domains. Fetches robots.txt and
 * a terms/legal page, both verbatim, and extracts only the sentences
 * containing a fixed keyword list -- no LLM, no summarisation. Raw HTML
 * never leaves this function; only the structured result (short excerpts,
 * a hash, counts) is returned to the caller.
 *
 * Never sets approved anywhere. Never writes source_domain_allowlist.
 * Writes only manufacturer_target_domains rows it was told to process.
 */

const USER_AGENT = "DogSmartDB/1.0 (+trainers@dogsmarttrainingbehaviour.co.uk)";
const REQUEST_SPACING_MS = 5000;
const MAX_STORED_CHARS = 8192;
const SENTENCE_SPAN_CAP = 400; // beyond this a "sentence" is unpunctuated nav/footer junk, not prose
const MATCH_WINDOW_CHARS = 200;
const AUTOMATED_PROXIMITY_CHARS = 60;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Named entities actually seen on UK pet-food/footer pages. Numeric entities
// (decimal and hex) are handled generically below.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "(c)",
  reg: "(R)",
  trade: "(TM)",
  mdash: "-",
  ndash: "-",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  hellip: "...",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return " ";
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return " ";
      }
    })
    .replace(/&([a-zA-Z]+);/g, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function stripHtml(html: string): string {
  const noTags = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

interface RobotsRule {
  pattern: string;
  allow: boolean;
}
interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
}
interface RobotsRules {
  groups: RobotsGroup[];
}

// Same algorithm as src/lib/crawler/robotsTxt.ts, duplicated here because
// Edge Functions are a separate Deno runtime and don't share the Next.js
// app's module graph.
function parseRobotsTxt(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let currentGroup: RobotsGroup | null = null;
  let groupIsOpen = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (line === "") continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (directive === "user-agent") {
      if (!groupIsOpen || currentGroup === null) {
        currentGroup = { userAgents: [value.toLowerCase()], rules: [] };
        groups.push(currentGroup);
        groupIsOpen = true;
      } else {
        currentGroup.userAgents.push(value.toLowerCase());
      }
      continue;
    }
    groupIsOpen = false;
    if (!currentGroup) continue;
    if (directive === "disallow") {
      if (value !== "") currentGroup.rules.push({ pattern: value, allow: false });
    } else if (directive === "allow") {
      if (value !== "") currentGroup.rules.push({ pattern: value, allow: true });
    }
  }
  return { groups };
}

function selectGroup(rules: RobotsRules, userAgent: string): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  let wildcard: RobotsGroup | null = null;
  for (const group of rules.groups) {
    for (const groupUa of group.userAgents) {
      if (groupUa === "*") {
        wildcard = wildcard ?? group;
        continue;
      }
      if (ua.includes(groupUa)) return group;
    }
  }
  return wildcard;
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegex(pattern: string): RegExp {
  const endsAnchored = pattern.endsWith("$");
  const body = endsAnchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.split("*").map(escapeRegexLiteral).join(".*");
  return new RegExp(`^${escaped}${endsAnchored ? "$" : ""}`);
}

function isPathAllowed(rules: RobotsRules, userAgent: string, pathWithQuery: string): boolean {
  const group = selectGroup(rules, userAgent);
  if (!group) return true;
  let best: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!patternToRegex(rule.pattern).test(pathWithQuery)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

async function fetchText(
  url: string
): Promise<{ ok: boolean; status?: number; body?: string; error?: string; finalUrl?: string }> {
  try {
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT } });
    const finalUrl = res.url && res.url !== url ? res.url : undefined;
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}`, finalUrl };
    return { ok: true, status: res.status, body: await res.text(), finalUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A candidate href must be a real, immediately-fetchable http(s) URL --
 *  not an unrendered JS template literal (feedwell.com served one as a
 *  search-widget href: "${window.rdRoutes.search_url}?q=${terms}") and
 *  not some other scheme (mailto:, javascript:, etc). */
function isFetchableHttpUrl(rawHref: string, resolved: string): boolean {
  if (rawHref.includes("${") || resolved.includes("${")) return false;
  try {
    const u = new URL(resolved);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function splitSentences(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const re = /[^.!?]+[.!?]*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0].trim().length === 0) continue;
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

// Each keyword given as its own regex, tuned to avoid known false positives
// (word boundaries throughout; 'copy' excludes 'copyright'; inflections
// allowed only where they don't create a new false-positive surface).
interface KeywordSpec {
  label: string;
  regex: RegExp;
  requiresProximityTo?: RegExp;
}

const KEYWORDS: KeywordSpec[] = [
  { label: "scrap", regex: /\bscrap\w*\b/gi },
  { label: "crawl", regex: /\bcrawl\w*\b/gi },
  { label: "robot", regex: /\brobot\w*\b/gi },
  { label: "spider", regex: /\bspider\w*\b/gi },
  { label: "text and data mining", regex: /\btext and data mining\b/gi },
  { label: "database right", regex: /\bdatabase rights?\b/gi },
  { label: "intellectual property", regex: /\bintellectual property\b/gi },
  { label: "reproduce", regex: /\breproduc\w*\b/gi },
  { label: "copy", regex: /\bcopy(?:ing|ied)?\b/gi }, // deliberately does not match "copyright"
  { label: "distribute", regex: /\bdistribut\w*\b/gi },
  { label: "commercial use", regex: /\bcommercial use\b/gi },
  { label: "personal use", regex: /\bpersonal use\b/gi },
  {
    label: "automated",
    regex: /\bautomated\b/gi,
    // GDPR boilerplate ("automated decision-making") is not a scraping clause.
    // Only count it near a term that's actually about site/data access.
    requiresProximityTo: /collect|access|extract|\btool\b|\bmeans\b|\bdevice\b|process the site/i,
  },
];

interface ExtractResult {
  excerpt: string | null;
  matchCount: number;
}

/** Deterministic keyword extraction: containing sentence + one either side, or a
 *  +/-200-char window centred on the match when the "sentence" is an unpunctuated
 *  nav/footer blob longer than SENTENCE_SPAN_CAP. Every capture is sliced directly
 *  from strippedText, then defensively re-asserted as a literal substring. */
function extractKeywordExcerpts(strippedText: string): ExtractResult {
  const sentences = splitSentences(strippedText);
  const capturedSpans: Array<{ start: number; end: number }> = [];

  const sentenceIndexAt = (pos: number): number => {
    for (let i = 0; i < sentences.length; i++) {
      if (pos >= sentences[i].start && pos < sentences[i].end) return i;
    }
    return -1;
  };

  for (const kw of KEYWORDS) {
    kw.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = kw.regex.exec(strippedText)) !== null) {
      const matchStart = m.index;
      const matchEnd = m.index + m[0].length;

      if (kw.requiresProximityTo) {
        const windowStart = Math.max(0, matchStart - AUTOMATED_PROXIMITY_CHARS);
        const windowEnd = Math.min(strippedText.length, matchEnd + AUTOMATED_PROXIMITY_CHARS);
        const window = strippedText.slice(windowStart, windowEnd);
        if (!kw.requiresProximityTo.test(window)) continue;
      }

      const sIdx = sentenceIndexAt(matchStart);
      if (sIdx === -1) {
        capturedSpans.push({
          start: Math.max(0, matchStart - MATCH_WINDOW_CHARS),
          end: Math.min(strippedText.length, matchEnd + MATCH_WINDOW_CHARS),
        });
        continue;
      }

      const sentenceSpan = sentences[sIdx];
      if (sentenceSpan.end - sentenceSpan.start > SENTENCE_SPAN_CAP) {
        // Unpunctuated nav/footer blob -- don't pull the whole thing in as context.
        capturedSpans.push({
          start: Math.max(0, matchStart - MATCH_WINDOW_CHARS),
          end: Math.min(strippedText.length, matchEnd + MATCH_WINDOW_CHARS),
        });
      } else {
        const prevIdx = Math.max(0, sIdx - 1);
        const nextIdx = Math.min(sentences.length - 1, sIdx + 1);
        capturedSpans.push({ start: sentences[prevIdx].start, end: sentences[nextIdx].end });
      }
    }
  }

  capturedSpans.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const span of capturedSpans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }

  const pieces: string[] = [];
  let budget = MAX_STORED_CHARS;
  for (const span of merged) {
    const piece = strippedText.slice(span.start, span.end).trim();
    if (piece.length === 0) continue;
    // ASSERT: every captured string is a literal substring of the source text.
    // Discard silently on failure -- never repair.
    if (!strippedText.includes(piece)) continue;
    if (piece.length > budget) break;
    pieces.push(piece);
    budget -= piece.length;
  }

  return { excerpt: pieces.length > 0 ? pieces.join(" [...] ") : null, matchCount: pieces.length };
}

function resolveUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// Priority order: a genuine terms/legal page beats a privacy policy every
// time -- a privacy policy is not a terms page and must never be presented
// as one. privacy-policy is a last-resort fallback only.
const TERMS_CATEGORIES: Array<{ category: string; patterns: RegExp[] }> = [
  { category: "terms-of-use", patterns: [/terms-of-use/i, /terms of use/i] },
  { category: "terms-and-conditions", patterns: [/terms-and-conditions/i, /terms\s*&\s*conditions/i, /terms and conditions/i] },
  { category: "terms-conditions", patterns: [/terms-conditions/i, /terms conditions/i] },
  { category: "terms", patterns: [/\bterms\b/i] },
  { category: "conditions-of-use", patterns: [/conditions-of-use/i, /conditions of use/i] },
  { category: "legal", patterns: [/\blegal\b/i] },
  { category: "copyright", patterns: [/copyright/i] },
  { category: "acceptable-use", patterns: [/acceptable-use/i, /acceptable use/i] },
];
const PRIVACY_FALLBACK = { category: "privacy-policy", patterns: [/privacy/i] };

const LINK_RE = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

interface TermsCandidate {
  url: string;
  category: string;
}

function findTermsCandidateLink(homepageHtml: string, baseUrl: string): TermsCandidate | null {
  const links: Array<{ href: string; text: string }> = [];
  LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(homepageHtml)) !== null) {
    links.push({ href: match[1], text: stripHtml(match[2]) });
  }

  for (const { category, patterns } of TERMS_CATEGORIES) {
    for (const link of links) {
      const matches = patterns.some((p) => p.test(link.href) || p.test(link.text));
      if (!matches) continue;
      const resolved = resolveUrl(baseUrl, link.href);
      if (resolved && isFetchableHttpUrl(link.href, resolved)) return { url: resolved, category };
    }
  }

  for (const link of links) {
    const matches = PRIVACY_FALLBACK.patterns.some((p) => p.test(link.href) || p.test(link.text));
    if (!matches) continue;
    const resolved = resolveUrl(baseUrl, link.href);
    if (resolved && isFetchableHttpUrl(link.href, resolved)) {
      return { url: resolved, category: `${PRIVACY_FALLBACK.category} (fallback -- no dedicated terms page found)` };
    }
  }

  return null;
}

interface DomainRow {
  id: string;
  domain: string;
  website_url: string | null;
  terms_url: string | null;
}

// Four outcomes, not one bucket. reviewed_pending_owner means evidence was
// actually gathered (an excerpt, or a verified zero-match) -- everything
// else stays out of the owner's decision queue until it's resolved.
type ReconStatus = "reviewed_pending_owner" | "no_terms_found" | "blocked" | "unresolved";

function baseResult(row: DomainRow, robotsRaw: string | null, status: ReconStatus, notes: string[], termsUrl: string | null = null) {
  return {
    id: row.id,
    domain: row.domain,
    robots_txt_raw: robotsRaw,
    robots_reviewed_at: new Date().toISOString(),
    terms_url: termsUrl,
    terms_excerpt: null as string | null,
    terms_fetched_at: null as string | null,
    terms_text_sha256: null as string | null,
    recon_status: status as string,
    recon_notes: notes.join("; "),
  };
}

async function reconOne(row: DomainRow) {
  const domain = row.domain;
  const notes: string[] = [];

  const robotsRes = await fetchText(`https://${domain}/robots.txt`);
  const robotsRaw = robotsRes.ok ? robotsRes.body ?? "" : null;
  const robotsRules = parseRobotsTxt(robotsRaw ?? "");
  // A missing robots.txt (404) is standard "allow all", not a block -- only
  // note it, don't treat it as blocked.
  if (!robotsRes.ok) notes.push(`robots.txt fetch failed: ${robotsRes.error}`);

  await sleep(REQUEST_SPACING_MS);

  let termsUrl = row.terms_url;
  let termsCategory: string | null = null;
  const baseUrl = row.website_url ?? `https://${domain}/`;

  if (!termsUrl) {
    const homeUrl = new URL(baseUrl);
    const homePath = homeUrl.pathname + homeUrl.search || "/";
    if (!isPathAllowed(robotsRules, USER_AGENT, homePath)) {
      return baseResult(row, robotsRaw, "blocked", [`homepage path disallowed by robots.txt: ${homePath}`, ...notes]);
    }

    const homeRes = await fetchText(baseUrl);
    await sleep(REQUEST_SPACING_MS);

    if (homeRes.finalUrl) {
      notes.push(`homepage redirected to ${homeRes.finalUrl} -- discovered domain kept in attribution_note, resolved host needs a manual domain-field check`);
    }

    if (!homeRes.ok || !homeRes.body) {
      if (homeRes.status === 403) {
        return baseResult(row, robotsRaw, "blocked", [`homepage fetch blocked: HTTP 403`, ...notes]);
      }
      return baseResult(row, robotsRaw, "unresolved", [`homepage fetch failed: ${homeRes.error ?? "no body"} -- target URL needs a manual check`, ...notes]);
    }

    const candidate = findTermsCandidateLink(homeRes.body, homeRes.finalUrl ?? baseUrl);
    if (candidate) {
      termsUrl = candidate.url;
      termsCategory = candidate.category;
    }
  }

  if (termsCategory) notes.push(`terms link category: ${termsCategory}`);

  if (!termsUrl) {
    return baseResult(row, robotsRaw, "no_terms_found", [
      "no terms/legal/privacy/copyright page found on site -- recorded as absence, not permission",
      ...notes,
    ]);
  }

  let termsPath: string;
  try {
    const parsed = new URL(termsUrl);
    termsPath = parsed.pathname + parsed.search;
  } catch {
    termsPath = "/";
  }
  if (!isPathAllowed(robotsRules, USER_AGENT, termsPath)) {
    return baseResult(row, robotsRaw, "blocked", [`terms page path disallowed by robots.txt: ${termsPath}`, ...notes], termsUrl);
  }

  const termsRes = await fetchText(termsUrl);
  if (termsRes.finalUrl) notes.push(`terms page redirected to ${termsRes.finalUrl}`);

  if (!termsRes.ok || !termsRes.body) {
    const status: ReconStatus = termsRes.status === 403 ? "blocked" : "unresolved";
    return baseResult(
      row,
      robotsRaw,
      status,
      [`terms page fetch failed: ${termsRes.error ?? "no body"}${status === "unresolved" ? " -- target URL needs a manual check" : ""}`, ...notes],
      termsUrl
    );
  }

  const strippedText = stripHtml(termsRes.body);
  const hash = await sha256Hex(strippedText);
  const { excerpt, matchCount } = extractKeywordExcerpts(strippedText);

  return {
    id: row.id,
    domain,
    robots_txt_raw: robotsRaw,
    robots_reviewed_at: new Date().toISOString(),
    terms_url: termsUrl,
    terms_excerpt: excerpt ?? "no matching clause found",
    terms_fetched_at: new Date().toISOString(),
    terms_text_sha256: hash,
    recon_status: "reviewed_pending_owner",
    // Keyword matching cannot tell a clause granting rights TO the site
    // operator apart from one restricting the user -- they read identically.
    // Every excerpt needs a human read for direction before it means anything.
    // Cleared only by an explicit owner review, never by this function.
    recon_notes: [`${matchCount} keyword-bearing passage(s) captured`, ...notes, "clause_direction_unverified"].join("; "),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body: { ids?: string[]; limit?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let rows: DomainRow[];
  if (body.ids && body.ids.length > 0) {
    // Cap 5 -- 16 domains in one call 502'd the gateway (2026-07-28).
    const cappedIds = body.ids.slice(0, 5);
    const { data, error } = await supabase
      .from("manufacturer_target_domains")
      .select("id, domain, website_url, terms_url")
      .in("id", cappedIds);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    rows = data as DomainRow[];
  } else {
    // Cap 5 -- 16 domains in one call 502'd the gateway (2026-07-28).
    const limit = Math.min(body.limit ?? 5, 5);
    const { data, error } = await supabase
      .from("manufacturer_target_domains")
      .select("id, domain, website_url, terms_url")
      .eq("recon_status", "not_started")
      .order("discovered_at", { ascending: true })
      .limit(limit);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    rows = data as DomainRow[];
  }

  const results = [];
  for (const row of rows) {
    const result = await reconOne(row);
    const { error: updateError } = await supabase
      .from("manufacturer_target_domains")
      .update({
        robots_txt_raw: result.robots_txt_raw,
        robots_reviewed_at: result.robots_reviewed_at,
        terms_url: result.terms_url,
        terms_excerpt: result.terms_excerpt,
        terms_fetched_at: result.terms_fetched_at,
        terms_text_sha256: result.terms_text_sha256,
        recon_status: result.recon_status,
        recon_notes: result.recon_notes,
      })
      .eq("id", result.id);
    results.push({ ...result, robots_txt_raw: undefined, write_error: updateError?.message ?? null });
    await sleep(REQUEST_SPACING_MS);
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
