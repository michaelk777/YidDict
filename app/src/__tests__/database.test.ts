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
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS saved_entries/);
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS cached_results/);
      expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS user_settings/);
    });

    it('seeds the default settings including source order and max_saved_entries', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const keys = mockDb.runAsync.mock.calls.map(([, params]: [string, string[]]) => params[0]);
      expect(keys).toContain('source_order_1');
      expect(keys).toContain('source_order_2');
      expect(keys).toContain('source_order_3');
      expect(keys).toContain('max_saved_entries');
      expect(keys).toContain('theme');
    });

    it('seeds source_order_1 as "finkel"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'source_order_1');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('finkel');
    });

    it('seeds source_order_2 as "google_translate"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'source_order_2');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('google_translate');
    });

    it('seeds source_order_3 as "none" (verterbukh is not a default source until the user logs in)', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'source_order_3');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('none');
    });

    it('seeds max_saved_entries as "500"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'max_saved_entries');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('500');
    });

    it('seeds theme as "system"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'theme');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('system');
    });

    it('seeds verterbukh_exhausted_alert as "1"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'verterbukh_exhausted_alert');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('1');
    });

    it('seeds verterbukh_low_token_alert as "1"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'verterbukh_low_token_alert');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('1');
    });

    it('seeds save_trim_alert as "1"', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const call = mockDb.runAsync.mock.calls.find(([, p]: [string, string[]]) => p[0] === 'save_trim_alert');
      expect(call).toBeDefined();
      expect(call[1][1]).toBe('1');
    });

    it('uses INSERT OR IGNORE to avoid overwriting existing settings', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      mockDb.runAsync.mock.calls.forEach(([sql]: [string]) => {
        expect(sql).toMatch(/INSERT OR IGNORE/);
      });
    });

    it('saved_entries table includes a source column with CHECK constraint', async () => {
      const { initDatabase, mockDb } = freshModules();
      await initDatabase();
      const sql: string = mockDb.execAsync.mock.calls[0][0];
      const savedMatch = sql.match(/CREATE TABLE IF NOT EXISTS saved_entries\s*\(([\s\S]*?)\);/);
      expect(savedMatch).not.toBeNull();
      expect(savedMatch![1]).toMatch(/source\s+TEXT\s+NOT NULL/);
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
