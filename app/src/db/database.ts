import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
  console.log('[YidDict] database: opening yiddict.db');
  db = await SQLite.openDatabaseAsync('yiddict.db');
  console.log('[YidDict] database: db opened successfully');

  // Migrate cached_results UNIQUE constraint to include yiddish_transliterated.
  // Entries that share yiddish_hebrew (e.g. a parent word and a phrase sub-entry)
  // were previously deduplicated by the narrower constraint, silently dropping the
  // phrase. Since cached_results is ephemeral, drop and recreate when outdated.
  const cacheTableSql = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='cached_results'"
  );
  if (cacheTableSql && !cacheTableSql.sql.includes('UNIQUE(query, yiddish_hebrew, yiddish_transliterated')) {
    await db.execAsync('DROP TABLE cached_results');
  }

  console.log('[YidDict] database: creating tables');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS saved_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      yiddish_hebrew TEXT,
      yiddish_transliterated TEXT,
      english TEXT,
      part_of_speech TEXT,
      grammatical_info TEXT,
      source TEXT NOT NULL CHECK(source IN ('finkel', 'verterbukh', 'google_translate')),
      saved_at INTEGER NOT NULL,
      is_phrase INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cached_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      yiddish_hebrew TEXT,
      yiddish_transliterated TEXT,
      english TEXT,
      part_of_speech TEXT,
      conjugation_info TEXT,
      source TEXT NOT NULL CHECK(source IN ('finkel', 'verterbukh', 'google_translate')),
      fetched_at INTEGER NOT NULL,
      is_phrase INTEGER NOT NULL DEFAULT 0,
      UNIQUE(query, yiddish_hebrew, yiddish_transliterated, source)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Rename yiddish_romanized → yiddish_transliterated on existing installs (no-op on fresh).
  try {
    await db.execAsync('ALTER TABLE saved_entries RENAME COLUMN yiddish_romanized TO yiddish_transliterated');
  } catch { /* already renamed or fresh install */ }
  try {
    await db.execAsync('ALTER TABLE cached_results RENAME COLUMN yiddish_romanized TO yiddish_transliterated');
  } catch { /* already renamed or fresh install */ }

  // hebrew_is_generated: add if not present.
  try {
    await db.execAsync('ALTER TABLE saved_entries ADD COLUMN hebrew_is_generated INTEGER NOT NULL DEFAULT 0');
  } catch { /* already exists */ }

  // transliterated_is_generated: rename old column on existing installs, then add for fresh installs.
  try {
    await db.execAsync('ALTER TABLE saved_entries RENAME COLUMN romanized_is_generated TO transliterated_is_generated');
  } catch { /* already renamed or doesn't exist */ }
  try {
    await db.execAsync('ALTER TABLE saved_entries ADD COLUMN transliterated_is_generated INTEGER NOT NULL DEFAULT 0');
  } catch { /* already exists (either from RENAME above or previous run) */ }

  console.log('[YidDict] database: tables created');

  const defaults: [string, string][] = [
    ['source_order_1', 'finkel'],
    ['source_order_2', 'verterbukh'],
    ['source_order_3', 'google_translate'],
    ['max_saved_entries', '500'],
    ['low_token_threshold', '90'],
    ['theme', 'system'],
    ['cache_ttl_days', '90'],
    ['max_cache_entries', '1000'],
    ['use_all_sources', '0'],
    ['yivo_to_hebrew', '0'],
    ['yivo_to_hebrew_warned', '0'],
    ['hebrew_to_yivo', '0'],
    ['hebrew_to_yivo_warned', '0'],
  ];

  console.log('[YidDict] database: seeding default settings');
  for (const [key, value] of defaults) {
    await db.runAsync(
      'INSERT OR IGNORE INTO user_settings (key, value) VALUES (?, ?)',
      [key, value]
    );
    console.log(`[YidDict] database: seeded "${key}" = "${value}"`);
  }
  console.log('[YidDict] database: initDatabase complete');
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}
