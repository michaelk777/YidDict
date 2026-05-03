import { getDatabase } from './database';
import { DictEntry } from '../types';
import { QueryScript } from '../utils/inputDetector';

type DictSource = 'finkel' | 'verterbukh' | 'google_translate';

// Shape of a row read from cached_results
interface CachedResultRow {
  id: number;
  query: string;
  yiddish_hebrew: string | null;
  yiddish_romanized: string | null;
  english: string | null;
  part_of_speech: string | null;
  conjugation_info: string | null;
  source: string;
  fetched_at: number;
  is_phrase: number; // SQLite stores booleans as 0/1
}

// Shape of a row read from search_history
export interface HistoryEntry {
  id: number;
  query: string;
  query_script: QueryScript;
  timestamp: number;
  source: string;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * Returns cached DictEntry rows for (query, source), or null if not cached
 * or if the cached result is older than cacheTtlDays (default 90).
 * Results are ordered by insertion (id ASC) to preserve the original ranking.
 */
export async function getCachedEntries(
  query: string,
  source: DictSource,
  cacheTtlDays = 90
): Promise<DictEntry[] | null> {
  console.log(`[YidDict] cacheDb: getCachedEntries query="${query}" source="${source}" ttl=${cacheTtlDays}d`);
  const db = getDatabase();
  const cutoff = Date.now() - cacheTtlDays * 24 * 60 * 60 * 1000;
  const rows = await db.getAllAsync<CachedResultRow>(
    'SELECT * FROM cached_results WHERE query = ? AND source = ? AND fetched_at > ? ORDER BY id ASC',
    [query, source, cutoff]
  );
  console.log(`[YidDict] cacheDb: cache ${rows.length ? 'HIT' : 'MISS'} — ${rows.length} row(s)`);
  if (!rows.length) return null;
  return rows.map(rowToEntry);
}

/**
 * Saves DictEntry results to the cache. One row per entry.
 * After saving, trims the cache to maxCacheEntries (default 1000) by
 * deleting the oldest rows first.
 */
export async function saveToCache(
  query: string,
  entries: DictEntry[],
  source: DictSource,
  maxCacheEntries = 1000
): Promise<void> {
  console.log(`[YidDict] cacheDb: saveToCache query="${query}" source="${source}" entries=${entries.length}`);
  const db = getDatabase();
  const now = Date.now();
  for (const entry of entries) {
    await db.runAsync(
      `INSERT INTO cached_results
         (query, yiddish_hebrew, yiddish_romanized, english,
          part_of_speech, conjugation_info, source,
          fetched_at, is_phrase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        query,
        entry.yiddishHebrew,
        entry.yiddishRomanized,
        entry.english,
        entry.partOfSpeech,
        entry.grammaticalInfo,
        source,
        now,
        entry.isPhrase ? 1 : 0,
      ]
    );
  }
  console.log(`[YidDict] cacheDb: saved ${entries.length} entr(ies) to cache`);
  await trimCache(maxCacheEntries);
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/**
 * Appends one row to search_history. Called after every lookup (cached or
 * live) so the user sees a complete chronological record.
 */
export async function logSearchHistory(
  query: string,
  queryScript: QueryScript,
  source: string
): Promise<void> {
  console.log(`[YidDict] cacheDb: logSearchHistory query="${query}" script="${queryScript}" source="${source}"`);
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO search_history (query, query_script, timestamp, source)
     VALUES (?, ?, ?, ?)`,
    [query, queryScript, Date.now(), source]
  );
}

/**
 * Returns the most recent history entries, newest first.
 * Respects the max_history user setting by default; pass a custom limit
 * to override (e.g. for the History screen which lets the user scroll).
 */
export async function getSearchHistory(limit = 10): Promise<HistoryEntry[]> {
  console.log(`[YidDict] cacheDb: getSearchHistory limit=${limit}`);
  const db = getDatabase();
  return db.getAllAsync<HistoryEntry>(
    'SELECT * FROM search_history ORDER BY timestamp DESC LIMIT ?',
    [limit]
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function trimCache(maxEntries: number): Promise<void> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM cached_results'
  );
  const count = row?.count ?? 0;
  const excess = count - maxEntries;
  if (excess > 0) {
    await db.runAsync(
      'DELETE FROM cached_results WHERE id IN (SELECT id FROM cached_results ORDER BY fetched_at ASC LIMIT ?)',
      [excess]
    );
    console.log(`[YidDict] cacheDb: trimmed ${excess} oldest entr(ies) from cache`);
  }
}

function rowToEntry(row: CachedResultRow): DictEntry {
  return {
    yiddishRomanized: row.yiddish_romanized,
    yiddishHebrew: row.yiddish_hebrew,
    english: row.english,
    partOfSpeech: row.part_of_speech,
    grammaticalInfo: row.conjugation_info,
    isPhrase: row.is_phrase === 1,
    exampleYiddish: null,
    exampleEnglish: null,
  };
}
