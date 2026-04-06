import { getDatabase } from './database';
import { FinkelEntry } from '../services/finkelService';
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
  raw_html: string | null;
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
 * Returns cached FinkelEntry rows for (query, source), or null if not cached.
 * Results are ordered by insertion (id ASC) to preserve the original ranking.
 */
export async function getCachedEntries(
  query: string,
  source: DictSource
): Promise<FinkelEntry[] | null> {
  const db = getDatabase();
  const rows = await db.getAllAsync<CachedResultRow>(
    'SELECT * FROM cached_results WHERE query = ? AND source = ? ORDER BY id ASC',
    [query, source]
  );
  if (!rows.length) return null;
  return rows.map(rowToEntry);
}

/**
 * Saves FinkelEntry results to the cache. One row per entry.
 * Existing cache rows for (query, source) are left in place; call
 * clearCache() first if you need to replace them.
 */
export async function saveToCache(
  query: string,
  entries: FinkelEntry[],
  source: DictSource
): Promise<void> {
  const db = getDatabase();
  const now = Date.now();
  for (const entry of entries) {
    await db.runAsync(
      `INSERT INTO cached_results
         (query, yiddish_hebrew, yiddish_romanized, english,
          part_of_speech, conjugation_info, source, raw_html,
          fetched_at, is_phrase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        query,
        entry.yiddishHebrew,
        entry.yiddishRomanized,
        entry.english,
        entry.partOfSpeech,
        entry.conjugationInfo,
        source,
        entry.rawHtml,
        now,
        entry.isPhrase ? 1 : 0,
      ]
    );
  }
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
  const db = getDatabase();
  return db.getAllAsync<HistoryEntry>(
    'SELECT * FROM search_history ORDER BY timestamp DESC LIMIT ?',
    [limit]
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToEntry(row: CachedResultRow): FinkelEntry {
  return {
    yiddishRomanized: row.yiddish_romanized,
    yiddishHebrew: row.yiddish_hebrew,
    english: row.english,
    partOfSpeech: row.part_of_speech,
    conjugationInfo: row.conjugation_info,
    isPhrase: row.is_phrase === 1,
    rawHtml: row.raw_html ?? '',
  };
}
