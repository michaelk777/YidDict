import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
  console.log('[YidDict] database: opening yiddict.db');
  db = await SQLite.openDatabaseAsync('yiddict.db');
  console.log('[YidDict] database: db opened successfully');

  console.log('[YidDict] database: creating tables');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      query_script TEXT NOT NULL CHECK(query_script IN ('hebrew', 'latin')),
      timestamp INTEGER NOT NULL,
      source TEXT NOT NULL,
      result_id INTEGER
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
      raw_html TEXT,
      fetched_at INTEGER NOT NULL,
      is_phrase INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migrations: add columns introduced after the initial schema.
  // ALTER TABLE ADD COLUMN has no IF NOT EXISTS; we catch and ignore the
  // "duplicate column" error so this is safe to run on every startup.
  const migrations = [
    'ALTER TABLE cached_results ADD COLUMN query TEXT NOT NULL DEFAULT ""',
    'ALTER TABLE cached_results ADD COLUMN is_phrase INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE search_history ADD COLUMN result_id INTEGER',
  ];
  for (const sql of migrations) {
    try {
      await db.execAsync(sql);
    } catch {
      // Column already exists — safe to ignore.
    }
  }
  console.log('[YidDict] database: tables created');

  const defaults: [string, string][] = [
    ['default_source', 'finkel'],
    ['max_history', '10'],
    ['theme', 'system'],
    ['cache_ttl_days', '90'],
    ['max_cache_entries', '1000'],
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
