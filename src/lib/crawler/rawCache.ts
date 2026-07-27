import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Raw HTTP response cache, keyed by URL + fetch date, kept separate from
 * parsed output. The point: re-parsing a page (e.g. after fixing
 * parse_composition) must never require re-fetching it. Every page is
 * fetched at most once per calendar day regardless of how many times it's
 * parsed afterward.
 */

export interface RawCacheEntry {
  url: string;
  fetchDate: string; // YYYY-MM-DD
  status: number;
  headers: Record<string, string>;
  body: string;
}

function cacheKey(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 24);
}

export class RawResponseCache {
  constructor(private readonly cacheDir: string) {}

  private filePath(url: string, fetchDate: string): string {
    return path.join(this.cacheDir, fetchDate, `${cacheKey(url)}.json`);
  }

  async get(url: string, fetchDate: string): Promise<RawCacheEntry | null> {
    try {
      const raw = await readFile(this.filePath(url, fetchDate), 'utf8');
      return JSON.parse(raw) as RawCacheEntry;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async set(entry: RawCacheEntry): Promise<void> {
    const filePath = this.filePath(entry.url, entry.fetchDate);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(entry), 'utf8');
  }
}

/** Today's date in the cache's YYYY-MM-DD key format, for a given clock. */
export function cacheDateFor(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}
