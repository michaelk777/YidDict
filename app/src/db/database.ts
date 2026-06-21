import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
  console.log('[YidDict] database: opening yiddict.db');
  db = await SQLite.openDatabaseAsync('yiddict.db');
  console.log('[YidDict] database: db opened successfully');

  console.log('[YidDict] database: creating tables');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS saved_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      yiddish_hebrew TEXT,
      yiddish_romanized TEXT,
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
      yiddish_romanized TEXT,
      english TEXT,
      part_of_speech TEXT,
      conjugation_info TEXT,
      source TEXT NOT NULL CHECK(source IN ('finkel', 'verterbukh', 'google_translate')),
      fetched_at INTEGER NOT NULL,
      is_phrase INTEGER NOT NULL DEFAULT 0,
      UNIQUE(query, yiddish_hebrew, source)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Column migration for saved_entries.
  try {
    await db.execAsync('ALTER TABLE saved_entries ADD COLUMN hebrew_is_generated INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists — safe to ignore.
  }
  try {
    await db.execAsync('ALTER TABLE saved_entries ADD COLUMN romanized_is_generated INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists — safe to ignore.
  }

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
