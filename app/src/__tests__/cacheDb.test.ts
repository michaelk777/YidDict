/**
 * cacheDb.test.ts
 *
 * Tests for cache read/write and history logging.
 * expo-sqlite is auto-mocked; getDatabase() is mocked to return the mock db.
 */

jest.mock('expo-sqlite');
jest.mock('../db/database');

import { getDatabase } from '../db/database';
import { __mockDb } from '../../__mocks__/expo-sqlite';
import {
  getCachedEntries,
  saveToCache,
  logSearchHistory,
  getSearchHistory,
} from '../db/cacheDb';
import { FinkelEntry } from '../services/finkelService';

const mockGetDatabase = getDatabase as jest.Mock;

const sampleEntry: FinkelEntry = {
  yiddishRomanized: 'sheyn',
  yiddishHebrew: 'שיין',
  english: 'pretty',
  partOfSpeech: 'adjective',
  conjugationInfo: null,
  isPhrase: false,
  rawHtml: '<li>sheyn</li>',
};

const sampleRow = {
  id: 1,
  query: 'sheyn',
  yiddish_romanized: 'sheyn',
  yiddish_hebrew: 'שיין',
  english: 'pretty',
  part_of_speech: 'adjective',
  conjugation_info: null,
  source: 'finkel',
  raw_html: '<li>sheyn</li>',
  fetched_at: 1000000,
  is_phrase: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetDatabase.mockReturnValue(__mockDb);
});

describe('getCachedEntries', () => {
  it('returns null when no cached rows exist', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([]);
    const result = await getCachedEntries('sheyn', 'finkel');
    expect(result).toBeNull();
  });

  it('queries with correct sql, query, and source', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getCachedEntries('sheyn', 'finkel');
    const [sql, params] = __mockDb.getAllAsync.mock.calls[0];
    expect(sql).toMatch(/SELECT.*FROM cached_results/i);
    expect(params).toContain('sheyn');
    expect(params).toContain('finkel');
  });

  it('returns mapped FinkelEntry array when rows exist', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([sampleRow]);
    const result = await getCachedEntries('sheyn', 'finkel');
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0].yiddishRomanized).toBe('sheyn');
    expect(result![0].yiddishHebrew).toBe('שיין');
    expect(result![0].english).toBe('pretty');
    expect(result![0].isPhrase).toBe(false);
  });

  it('maps is_phrase=1 to isPhrase=true', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([{ ...sampleRow, is_phrase: 1 }]);
    const result = await getCachedEntries('sheyn', 'finkel');
    expect(result![0].isPhrase).toBe(true);
  });

  it('maps null raw_html to empty string', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([{ ...sampleRow, raw_html: null }]);
    const result = await getCachedEntries('sheyn', 'finkel');
    expect(result![0].rawHtml).toBe('');
  });
});

describe('saveToCache', () => {
  it('calls runAsync once per entry', async () => {
    const entries = [sampleEntry, { ...sampleEntry, english: 'beautiful' }];
    await saveToCache('sheyn', entries, 'finkel');
    expect(__mockDb.runAsync).toHaveBeenCalledTimes(2);
  });

  it('inserts with correct query and source', async () => {
    await saveToCache('sheyn', [sampleEntry], 'finkel');
    const [sql, params] = __mockDb.runAsync.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO cached_results/i);
    expect(params).toContain('sheyn');
    expect(params).toContain('finkel');
  });

  it('stores is_phrase as 1 for phrase entries', async () => {
    const phrase = { ...sampleEntry, isPhrase: true };
    await saveToCache('sheyn', [phrase], 'finkel');
    const [, params] = __mockDb.runAsync.mock.calls[0];
    expect(params).toContain(1); // is_phrase = 1
  });

  it('stores is_phrase as 0 for non-phrase entries', async () => {
    await saveToCache('sheyn', [sampleEntry], 'finkel');
    const [, params] = __mockDb.runAsync.mock.calls[0];
    expect(params).toContain(0); // is_phrase = 0
  });

  it('does nothing when entries array is empty', async () => {
    await saveToCache('sheyn', [], 'finkel');
    expect(__mockDb.runAsync).not.toHaveBeenCalled();
  });
});

describe('logSearchHistory', () => {
  it('inserts one row into search_history', async () => {
    await logSearchHistory('sheyn', 'latin', 'finkel');
    expect(__mockDb.runAsync).toHaveBeenCalledTimes(1);
    const [sql] = __mockDb.runAsync.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO search_history/i);
  });

  it('logs the correct query, script, and source', async () => {
    await logSearchHistory('sheyn', 'latin', 'finkel');
    const [, params] = __mockDb.runAsync.mock.calls[0];
    expect(params).toContain('sheyn');
    expect(params).toContain('latin');
    expect(params).toContain('finkel');
  });

  it('logs hebrew script correctly', async () => {
    await logSearchHistory('שיין', 'hebrew', 'finkel');
    const [, params] = __mockDb.runAsync.mock.calls[0];
    expect(params).toContain('שיין');
    expect(params).toContain('hebrew');
  });

  it('includes a numeric timestamp', async () => {
    const before = Date.now();
    await logSearchHistory('sheyn', 'latin', 'finkel');
    const after = Date.now();
    const [, params] = __mockDb.runAsync.mock.calls[0];
    const ts = params[2] as number;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('getSearchHistory', () => {
  it('queries search_history ordered by timestamp DESC', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getSearchHistory();
    const [sql] = __mockDb.getAllAsync.mock.calls[0];
    expect(sql).toMatch(/ORDER BY timestamp DESC/i);
  });

  it('applies default limit of 10', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getSearchHistory();
    const [, params] = __mockDb.getAllAsync.mock.calls[0];
    expect(params).toContain(10);
  });

  it('applies custom limit when provided', async () => {
    __mockDb.getAllAsync.mockResolvedValueOnce([]);
    await getSearchHistory(25);
    const [, params] = __mockDb.getAllAsync.mock.calls[0];
    expect(params).toContain(25);
  });

  it('returns the rows from the database', async () => {
    const fakeRows = [
      { id: 1, query: 'sheyn', query_script: 'latin', timestamp: 1000, source: 'finkel' },
    ];
    __mockDb.getAllAsync.mockResolvedValueOnce(fakeRows);
    const result = await getSearchHistory();
    expect(result).toEqual(fakeRows);
  });
});
