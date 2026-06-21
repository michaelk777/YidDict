import { getDatabase } from './database';
import { getMaxSavedEntries } from './settingsDb';
import { DictEntry } from '../types';

type DictSource = 'finkel' | 'verterbukh' | 'google_translate';

interface SavedRow {
  id: number;
  query: string;
  yiddish_hebrew: string | null;
  yiddish_romanized: string | null;
  english: string | null;
  part_of_speech: string | null;
  grammatical_info: string | null;
  source: string;
  saved_at: number;
  is_phrase: number;
  hebrew_is_generated: number;
  romanized_is_generated: number;
}

export interface SavedEntry {
  id: number;
  query: string;
  yiddishHebrew: string | null;
  yiddishRomanized: string | null;
  english: string | null;
  partOfSpeech: string | null;
  grammaticalInfo: string | null;
  source: string;
  savedAt: number;
  isPhrase: boolean;
  hebrewIsGenerated: boolean;
  romanizedIsGenerated: boolean;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getSavedEntries(): Promise<SavedEntry[]> {
  console.log('[YidDict] savedDb: getSavedEntries');
  const db = getDatabase();
  const rows = await db.getAllAsync<SavedRow>(
    'SELECT * FROM saved_entries ORDER BY saved_at DESC'
  );
  return rows.map(rowToSavedEntry);
}

/**
 * Returns a Set of composite keys for all saved entries.
 * Key format: `${yiddishHebrew ?? ''}|${english ?? ''}|${source}`.
 * Used by SearchScreen to show filled/outline bookmark per result.
 */
export async function getSavedKeySet(): Promise<Set<string>> {
  console.log('[YidDict] savedDb: getSavedKeySet');
  const db = getDatabase();
  const rows = await db.getAllAsync<Pick<SavedRow, 'yiddish_hebrew' | 'english' | 'source'>>(
    'SELECT yiddish_hebrew, english, source FROM saved_entries'
  );
  return new Set(rows.map(r => `${r.yiddish_hebrew ?? ''}|${r.english ?? ''}|${r.source}`));
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export async function saveEntry(
  query: string,
  entry: DictEntry,
  source: DictSource,
  maxSavedEntries?: number
): Promise<void> {
  console.log(`[YidDict] savedDb: saveEntry query="${query}" source="${source}"`);
  const max = maxSavedEntries ?? await getMaxSavedEntries();
  const db = getDatabase();
  await db.runAsync(
    `INSERT INTO saved_entries
       (query, yiddish_hebrew, yiddish_romanized, english,
        part_of_speech, grammatical_info, source, saved_at, is_phrase, hebrew_is_generated, romanized_is_generated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      query,
      entry.yiddishHebrew,
      entry.yiddishRomanized,
      entry.english,
      entry.partOfSpeech,
      entry.grammaticalInfo,
      source,
      Date.now(),
      entry.isPhrase ? 1 : 0,
      entry.hebrewIsGenerated ? 1 : 0,
      entry.romanizedIsGenerated ? 1 : 0,
    ]
  );
  await trimSaved(max);
}

export async function saveEntries(
  query: string,
  entries: DictEntry[],
  source: DictSource,
  maxSavedEntries?: number
): Promise<void> {
  console.log(`[YidDict] savedDb: saveEntries query="${query}" source="${source}" count=${entries.length}`);
  if (entries.length === 0) return;
  const max = maxSavedEntries ?? await getMaxSavedEntries();
  for (const entry of entries) {
    await saveEntry(query, entry, source, max);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteEntry(id: number): Promise<void> {
  console.log(`[YidDict] savedDb: deleteEntry id=${id}`);
  const db = getDatabase();
  await db.runAsync('DELETE FROM saved_entries WHERE id = ?', [id]);
}

export async function deleteEntriesByKey(
  entries: DictEntry[],
  source: DictSource,
): Promise<void> {
  console.log(`[YidDict] savedDb: deleteEntriesByKey source="${source}" count=${entries.length}`);
  const db = getDatabase();
  for (const entry of entries) {
    await db.runAsync(
      'DELETE FROM saved_entries WHERE yiddish_hebrew IS ? AND english IS ? AND source = ?',
      [entry.yiddishHebrew ?? null, entry.english ?? null, source]
    );
  }
}

export async function clearSaved(): Promise<void> {
  console.log('[YidDict] savedDb: clearSaved');
  const db = getDatabase();
  await db.runAsync('DELETE FROM saved_entries');
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Combines partOfSpeech and grammaticalInfo into a single display string.
 * Called fullGrammar to make clear it is the union of the two fields.
 */
export function buildFullGrammar(
  partOfSpeech: string | null,
  grammaticalInfo: string | null
): string {
  if (partOfSpeech && grammaticalInfo) return `${partOfSpeech}  ${grammaticalInfo}`;
  return partOfSpeech ?? grammaticalInfo ?? '';
}

const EXPORT_HEADER = ['Yiddish', 'Transliteration', 'English', 'Grammar', 'Source', 'Tags'];

function entryToColumns(e: SavedEntry): string[] {
  return [
    e.yiddishHebrew ?? '',
    e.yiddishRomanized ?? '',
    e.english ?? '',
    buildFullGrammar(e.partOfSpeech, e.grammaticalInfo),
    e.source,
    'YidDict',
  ];
}

/**
 * Generates a comma-separated CSV string from saved entries, with a header row.
 * Values containing commas or quotes are quoted per RFC 4180.
 */
export function generateCsv(entries: SavedEntry[]): string {
  const header = EXPORT_HEADER.join(',');
  const rows = entries.map(e =>
    entryToColumns(e)
      .map(v => `"${v.replace(/"/g, '""')}"`)
      .join(',')
  );
  return '﻿' + [header, ...rows].join('\n');
}

/**
 * Generates a tab-separated TSV string from saved entries, with a header row.
 */
export function generateTsv(entries: SavedEntry[]): string {
  const header = EXPORT_HEADER.join('\t');
  const rows = entries.map(e => entryToColumns(e).join('\t'));
  return '﻿' + [header, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function trimSaved(maxEntries: number): Promise<void> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM saved_entries'
  );
  const count = row?.count ?? 0;
  const excess = count - maxEntries;
  if (excess > 0) {
    await db.runAsync(
      'DELETE FROM saved_entries WHERE id IN (SELECT id FROM saved_entries ORDER BY saved_at ASC LIMIT ?)',
      [excess]
    );
    console.log(`[YidDict] savedDb: trimmed ${excess} oldest saved entr(ies)`);
  }
}

function rowToSavedEntry(row: SavedRow): SavedEntry {
  return {
    id: row.id,
    query: row.query,
    yiddishHebrew: row.yiddish_hebrew,
    yiddishRomanized: row.yiddish_romanized,
    english: row.english,
    partOfSpeech: row.part_of_speech,
    grammaticalInfo: row.grammatical_info,
    source: row.source,
    savedAt: row.saved_at,
    isPhrase: row.is_phrase === 1,
    hebrewIsGenerated: row.hebrew_is_generated === 1,
    romanizedIsGenerated: row.romanized_is_generated === 1,
  };
}
