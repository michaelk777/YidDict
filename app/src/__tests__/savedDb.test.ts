jest.mock('expo-sqlite');
jest.mock('../db/database');

import { getDatabase } from '../db/database';
import { __mockDb } from '../../__mocks__/expo-sqlite';
import {
  getSavedEntries,
  getSavedKeySet,
  saveEntry,
  saveEntries,
  deleteEntry,
  clearSaved,
  buildFullGrammar,
  generateCsv,
  generateTsv,
  SavedEntry,
} from '../db/savedDb';
import { DictEntry } from '../types';

const mockGetDatabase = getDatabase as jest.Mock;

const sampleEntry: DictEntry = {
  yiddishRomanized: 'sheyn',
  yiddishHebrew: 'שיין',
  english: 'pretty',
  partOfSpeech: 'adjective',
  grammaticalInfo: null,
  isPhrase: false,
  exampleYiddish: null,
  exampleEnglish: null,
};

const sampleRow = {
  id: 1,
  query: 'sheyn',
  yiddish_hebrew: 'שיין',
  yiddish_romanized: 'sheyn',
  english: 'pretty',
  part_of_speech: 'adjective',
  grammatical_info: null,
  source: 'finkel',
  saved_at: 1000000,
  is_phrase: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDatabase.mockReturnValue(__mockDb);
});

// ---------------------------------------------------------------------------
// getSavedEntries
// ---------------------------------------------------------------------------

describe('getSavedEntries', () => {
  it('returns an empty array when no rows exist', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([]);
    expect(await getSavedEntries()).toEqual([]);
  });

  it('queries saved_entries ordered by saved_at DESC', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getSavedEntries();
    const [sql] = __mockDb.getAllAsync.mock.calls[0];
    expect(sql).toMatch(/FROM saved_entries.*ORDER BY saved_at DESC/i);
  });

  it('maps a row to a SavedEntry correctly', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([sampleRow]);
    const [result] = await getSavedEntries();
    expect(result.id).toBe(1);
    expect(result.query).toBe('sheyn');
    expect(result.yiddishHebrew).toBe('שיין');
    expect(result.yiddishRomanized).toBe('sheyn');
    expect(result.english).toBe('pretty');
    expect(result.partOfSpeech).toBe('adjective');
    expect(result.grammaticalInfo).toBeNull();
    expect(result.source).toBe('finkel');
    expect(result.savedAt).toBe(1000000);
    expect(result.isPhrase).toBe(false);
  });

  it('maps is_phrase=1 to isPhrase=true', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([{ ...sampleRow, is_phrase: 1 }]);
    const [result] = await getSavedEntries();
    expect(result.isPhrase).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getSavedKeySet
// ---------------------------------------------------------------------------

describe('getSavedKeySet', () => {
  it('returns an empty Set when no rows exist', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([]);
    const set = await getSavedKeySet();
    expect(set.size).toBe(0);
  });

  it('builds keys as yiddishHebrew|english|source', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([
      { yiddish_hebrew: 'שיין', english: 'pretty', source: 'finkel' },
    ]);
    const set = await getSavedKeySet();
    expect(set.has('שיין|pretty|finkel')).toBe(true);
  });

  it('handles null yiddishHebrew', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([
      { yiddish_hebrew: null, english: 'pretty', source: 'google_translate' },
    ]);
    const set = await getSavedKeySet();
    expect(set.has('|pretty|google_translate')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// saveEntry
// ---------------------------------------------------------------------------

describe('saveEntry', () => {
  it('inserts one row into saved_entries', async () => {
    await saveEntry('sheyn', sampleEntry, 'finkel');
    const insertCalls = (__mockDb.runAsync.mock.calls as [string, unknown[]][])
      .filter(([sql]) => sql.includes('INSERT INTO saved_entries'));
    expect(insertCalls.length).toBe(1);
  });

  it('stores the query and source', async () => {
    await saveEntry('sheyn', sampleEntry, 'finkel');
    const [, params] = __mockDb.runAsync.mock.calls[0];
    expect(params).toContain('sheyn');
    expect(params).toContain('finkel');
  });

  it('stores is_phrase as 1 for phrase entries', async () => {
    await saveEntry('sheyn', { ...sampleEntry, isPhrase: true }, 'finkel');
    const [, params] = __mockDb.runAsync.mock.calls[0];
    expect(params).toContain(1);
  });

  it('stores is_phrase as 0 for non-phrase entries', async () => {
    await saveEntry('sheyn', sampleEntry, 'finkel');
    const [, params] = __mockDb.runAsync.mock.calls[0];
    expect(params).toContain(0);
  });

  it('trims to max entries after saving', async () => {
    __mockDb.getFirstAsync.mockResolvedValueOnce({ count: 505 });
    await saveEntry('sheyn', sampleEntry, 'finkel', 500);
    const deleteCalls = (__mockDb.runAsync.mock.calls as [string, unknown[]][])
      .filter(([sql]) => (sql as string).includes('DELETE'));
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0][1]).toContain(5);
  });

  it('does not trim when under max entries', async () => {
    __mockDb.getFirstAsync.mockResolvedValueOnce({ count: 10 });
    await saveEntry('sheyn', sampleEntry, 'finkel', 500);
    const deleteCalls = (__mockDb.runAsync.mock.calls as [string, unknown[]][])
      .filter(([sql]) => (sql as string).includes('DELETE'));
    expect(deleteCalls.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// saveEntries
// ---------------------------------------------------------------------------

describe('saveEntries', () => {
  it('calls saveEntry once per entry', async () => {
    const entries = [sampleEntry, { ...sampleEntry, english: 'beautiful' }];
    await saveEntries('sheyn', entries, 'finkel');
    const insertCalls = (__mockDb.runAsync.mock.calls as [string, unknown[]][])
      .filter(([sql]) => sql.includes('INSERT INTO saved_entries'));
    expect(insertCalls.length).toBe(2);
  });

  it('does nothing when entries array is empty', async () => {
    await saveEntries('sheyn', [], 'finkel');
    expect(__mockDb.runAsync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteEntry
// ---------------------------------------------------------------------------

describe('deleteEntry', () => {
  it('deletes the row with the given id', async () => {
    await deleteEntry(42);
    const [sql, params] = __mockDb.runAsync.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM saved_entries WHERE id = \?/i);
    expect(params).toContain(42);
  });
});

// ---------------------------------------------------------------------------
// clearSaved
// ---------------------------------------------------------------------------

describe('clearSaved', () => {
  it('deletes all rows from saved_entries', async () => {
    await clearSaved();
    const [sql] = __mockDb.runAsync.mock.calls[0];
    expect(sql).toMatch(/DELETE FROM saved_entries$/i);
  });
});

// ---------------------------------------------------------------------------
// buildFullGrammar
// ---------------------------------------------------------------------------

describe('buildFullGrammar', () => {
  it('joins partOfSpeech and grammaticalInfo with two spaces', () => {
    expect(buildFullGrammar('noun', 'gender f')).toBe('noun  gender f');
  });

  it('returns only partOfSpeech when grammaticalInfo is null', () => {
    expect(buildFullGrammar('verb', null)).toBe('verb');
  });

  it('returns only grammaticalInfo when partOfSpeech is null', () => {
    expect(buildFullGrammar(null, 'gender f')).toBe('gender f');
  });

  it('returns empty string when both are null', () => {
    expect(buildFullGrammar(null, null)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// generateCsv
// ---------------------------------------------------------------------------

const savedEntry: SavedEntry = {
  id: 1,
  query: 'sheyn',
  yiddishHebrew: 'שיין',
  yiddishRomanized: 'sheyn',
  english: 'pretty',
  partOfSpeech: 'adjective',
  grammaticalInfo: null,
  source: 'finkel',
  savedAt: 1000000,
  isPhrase: false,
};

describe('generateCsv', () => {
  it('includes a header row', () => {
    const csv = generateCsv([]);
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toContain('Yiddish (Hebrew)');
    expect(firstLine).toContain('English');
    expect(firstLine).toContain('Full Grammar');
    expect(firstLine).toContain('Source');
  });

  it('includes one data row per entry', () => {
    const csv = generateCsv([savedEntry]);
    const lines = csv.split('\n');
    expect(lines.length).toBe(2); // header + 1 data row
  });

  it('comma-separates values', () => {
    const csv = generateCsv([savedEntry]);
    const dataLine = csv.split('\n')[1];
    expect(dataLine.split(',').length).toBeGreaterThanOrEqual(5);
  });

  it('quotes values to handle commas in content', () => {
    const entry = { ...savedEntry, english: 'pretty, beautiful' };
    const csv = generateCsv([entry]);
    expect(csv).toContain('"pretty, beautiful"');
  });

  it('escapes internal double quotes', () => {
    const entry = { ...savedEntry, english: 'say "hi"' };
    const csv = generateCsv([entry]);
    expect(csv).toContain('"say ""hi"""');
  });
});

// ---------------------------------------------------------------------------
// generateTsv
// ---------------------------------------------------------------------------

describe('generateTsv', () => {
  it('includes a header row', () => {
    const tsv = generateTsv([]);
    const firstLine = tsv.split('\n')[0];
    expect(firstLine).toContain('Yiddish (Hebrew)');
    expect(firstLine).toContain('Full Grammar');
  });

  it('tab-separates values', () => {
    const tsv = generateTsv([savedEntry]);
    const dataLine = tsv.split('\n')[1];
    expect(dataLine.split('\t').length).toBeGreaterThanOrEqual(5);
  });

  it('includes one data row per entry', () => {
    const tsv = generateTsv([savedEntry]);
    const lines = tsv.split('\n');
    expect(lines.length).toBe(2); // header + 1 data row
  });
});
