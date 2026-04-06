/**
 * database.test.ts
 *
 * expo-sqlite is auto-mocked from __mocks__/expo-sqlite.ts.
 * We use jest.isolateModules() + require() (not dynamic import())
 * to get a fresh module instance for each test, since database.ts
 * holds the db reference as module-level state.
 */

jest.mock('expo-sqlite');

// Helper: get a fresh copy of database module + fresh mock db state
function freshModules() {
  let db: ReturnType<typeof import('../../__mocks__/expo-sqlite').__mockDb.execAsync.mock.calls[0]>;
  let initDatabase: () => Promise<void>;
  let getDatabase: () => unknown;
  let mockOpen: jest.Mock;
  let mockDb: typeof import('../../__mocks__/expo-sqlite').__mockDb;

  jest.isolateModules(() => {
    // Re-require expo-sqlite mock inside isolation so its internal state is fresh
    jest.resetModules();
    const sqliteMock = require('expo-sqlite');
    mockOpen = sqliteMock.openDatabaseAsync as jest.Mock;
    mockDb = sqliteMock.__mockDb;

    const dbModule = require('../db/database');
    initDatabase = dbModule.initDatabase;
    getDatabase = dbModule.getDatabase;
  });

  return { initDatabase: initDatabase!, getDatabase: getDatabase!, mockOpen: mockOpen!, mockDb: mockDb! };
}

describe('database', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDatabase()', () => {
    it('throws before initDatabase() is called', () => {
      const { getDatabase } = freshModules();
      expect(() => getDatabase()).toThrow('Database not initialized. Call initDatabase() first.');
    });
  });

  describe('initDatabase()', () => {
    it('opens the database with the correct filename', async () => {
      const { initDatabase, mockOpen } = freshModules();
      await initDatabase();
      expect(mockOpen).toHaveBeenCalledWith('yiddict.db');
    });

    it('creates all three tables', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const sql: string = mockDb.execAsync.mock.calls[0][0];
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS search_history/);
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS cached_results/);
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS user_settings/);
    });

    it('seeds the three default settings', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const keys = mockDb.runAsync.mock.calls.map(([, params]: [string, string[]]) => params[0]);
      expect(keys).toContain('default_source');
      expect(keys).toContain('max_history');
      expect(keys).toContain('theme');
    });

    it('seeds default_source as "finkel"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'default_source');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('finkel');
    });

    it('seeds max_history as "10"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'max_history');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('10');
    });

    it('seeds theme as "system"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'theme');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('system');
    });

    it('uses INSERT OR IGNORE to avoid overwriting existing settings', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      mockDb.runAsync.mock.calls.forEach(([sql]: [string]) => {
        expect(sql).toMatch(/INSERT OR IGNORE/);
      });
    });

    it('search_history table includes a source column', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const sql: string = mockDb.execAsync.mock.calls[0][0];
      // Verify source column exists in search_history (it has no CHECK constraint,
      // unlike cached_results, so we check the column definition directly)
      const historyTableMatch = sql.match(/CREATE TABLE IF NOT EXISTS search_history\s*\(([\s\S]*?)\);/);
      expect(historyTableMatch).not.toBeNull();
      expect(historyTableMatch![1]).toMatch(/source\s+TEXT\s+NOT NULL/);
    });

    it('schema enforces query_script CHECK constraint', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const sql: string = mockDb.execAsync.mock.calls[0][0];
      // 'english' was removed — Finkel accepts all scripts in one field
      expect(sql).toMatch(/CHECK\(query_script IN \('hebrew', 'latin'\)\)/);
    });

    it('cached_results table includes a query column', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const sql: string = mockDb.execAsync.mock.calls[0][0];
      const cachedMatch = sql.match(/CREATE TABLE IF NOT EXISTS cached_results\s*\(([\s\S]*?)\);/);
      expect(cachedMatch).not.toBeNull();
      expect(cachedMatch![1]).toMatch(/query\s+TEXT/);
    });

    it('cached_results table includes an is_phrase column', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const sql: string = mockDb.execAsync.mock.calls[0][0];
      const cachedMatch = sql.match(/CREATE TABLE IF NOT EXISTS cached_results\s*\(([\s\S]*?)\);/);
      expect(cachedMatch).not.toBeNull();
      expect(cachedMatch![1]).toMatch(/is_phrase\s+INTEGER/);
    });

    it('schema enforces source CHECK constraint for cached_results', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const sql: string = mockDb.execAsync.mock.calls[0][0];
      expect(sql).toMatch(/CHECK\(source IN \('finkel', 'verterbukh', 'google_translate'\)\)/);
    });

    it('getDatabase() returns the db instance after init', async () => {
      const { initDatabase, getDatabase, mockDb } = freshModules();
      await initDatabase();
      expect(() => getDatabase()).not.toThrow();
      expect(getDatabase()).toBe(mockDb);
    });
  });
});
