import { getDatabase } from './database';
import { DictEntry } from '../types';
import { log } from '../utils/logger';

type DictSource = 'finkel' | 'verterbukh' | 'google_translate';

// Shape of a row read from cached_results
interface CachedResultRow {
  id: number;
  query: string;
  yiddish_hebrew: string | null;
  yiddish_transliterated: string | null;
  english: string | null;
  part_of_speech: string | null;
  conjugation_info: string | null;
  source: string;
  fetched_at: number;
  is_phrase: number; // SQLite stores booleans as 0/1
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
  log(`[YidDict] cacheDb: getCachedEntries query="${query}" source="${source}" ttl=${cacheTtlDays}d`);
  const db = getDatabase();
  const cutoff = Date.now() - cacheTtlDays * 24 * 60 * 60 * 1000;
  const rows = await db.getAllAsync<CachedResultRow>(
    'SELECT * FROM cached_results WHERE query = ? AND source = ? AND fetched_at > ? ORDER BY id ASC',
    [query, source, cutoff]
  );
  log(`[YidDict] cacheDb: cache ${rows.length ? 'HIT' : 'MISS'} — ${rows.length} row(s)`);
  if (!rows.length) return null;
  return rows.map(rowToEntry);
}

/**
 * Saves DictEntry results to the cache. One row per entry.
 * After saving, trims the cache to maxCacheEntries (default 5000) by
 * deleting the oldest rows first.
 */
export async function saveToCache(
  query: string,
  entries: DictEntry[],
  source: DictSource,
  { maxCacheEntries = 5000 }: { maxCacheEntries?: number } = {}
): Promise<void> {
  log(`[YidDict] cacheDb: saveToCache query="${query}" source="${source}" entries=${entries.length}`);
  const db = getDatabase();
  const now = Date.now();
  for (const entry of entries) {
    await db.runAsync(
      `INSERT OR IGNORE INTO cached_results
         (query, yiddish_hebrew, yiddish_transliterated, english,
          part_of_speech, conjugation_info, source,
          fetched_at, is_phrase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        query,
        entry.yiddishHebrew,
        entry.yiddishTransliterated,
        entry.english,
        entry.partOfSpeech,
        entry.grammaticalInfo,
        source,
        now,
        entry.isPhrase ? 1 : 0,
      ]
    );
  }
  log(`[YidDict] cacheDb: saved ${entries.length} entr(ies) to cache`);
  await trimCache(maxCacheEntries);
}

/**
 * Returns the number of cached_results rows older than cacheTtlDays — i.e.
 * how many rows purgeExpiredCache(cacheTtlDays) would remove right now.
 */
export async function countExpiringCache(cacheTtlDays: number): Promise<number> {
  const db = getDatabase();
  const cutoff = Date.now() - cacheTtlDays * 24 * 60 * 60 * 1000;
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM cached_results WHERE fetched_at <= ?', [cutoff]
  );
  return row?.count ?? 0;
}

/**
 * Deletes cached_results rows older than cacheTtlDays. Run on app launch and
 * whenever the user changes the cache TTL setting, so entries that fall
 * outside the (possibly new, shorter) window are purged immediately rather
 * than lingering as unrefreshable rows.
 */
export async function purgeExpiredCache(cacheTtlDays: number): Promise<void> {
  const db = getDatabase();
  const cutoff = Date.now() - cacheTtlDays * 24 * 60 * 60 * 1000;
  const result = await db.runAsync('DELETE FROM cached_results WHERE fetched_at <= ?', [cutoff]);
  log(`[YidDict] cacheDb: purgeExpiredCache ttl=${cacheTtlDays}d — removed ${result.changes} row(s)`);
}

/**
 * Deletes all rows from cached_results. Does not affect saved_entries.
 * After clearing, any new lookups will be fetched fresh and re-cached from day 1.
 */
export async function clearCache(): Promise<void> {
  log('[YidDict] cacheDb: clearCache — deleting all cached_results rows');
  const db = getDatabase();
  await db.runAsync('DELETE FROM cached_results');
  log('[YidDict] cacheDb: cache cleared');
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
    log(`[YidDict] cacheDb: trimmed ${excess} oldest entr(ies) from cache`);
  }
}

function rowToEntry(row: CachedResultRow): DictEntry {
  return {
    source: row.source as DictEntry['source'],
    fromCache: true,
    yiddishTransliterated: row.yiddish_transliterated,
    yiddishHebrew: row.yiddish_hebrew,
    english: row.english,
    partOfSpeech: row.part_of_speech,
    grammaticalInfo: row.conjugation_info,
    isPhrase: row.is_phrase === 1,
  };
}
