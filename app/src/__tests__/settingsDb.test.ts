/**
 * settingsDb.test.ts
 *
 * Unit tests for getSourceOrder, setSourceOrderSlot, and the pure helper
 * availableOptionsForSlot. expo-sqlite is auto-mocked.
 */

jest.mock('expo-sqlite');
jest.mock('../db/database');

import {
  getSourceOrder,
  setSourceOrderSlot,
  availableOptionsForSlot,
  getNumericSetting,
  setNumericSetting,
  getMaxSavedEntries,
  getLowTokenThreshold,
  getCacheTtlDays,
  getVerterbukhExhaustedAlert,
  setVerterbukhExhaustedAlert,
  getVerterbukhQuota,
  clearVerterbukhQuota,
  SourceSlot,
} from '../db/settingsDb';
import { getDatabase } from '../db/database';

const mockGetDatabase = getDatabase as jest.Mock;

function makeMockDb(rows: Record<string, string> = {}) {
  return {
    getFirstAsync: jest.fn((_sql: string, params: string[]) => {
      const key = params[0];
      return Promise.resolve(key in rows ? { value: rows[key] } : null);
    }),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getSourceOrder
// ---------------------------------------------------------------------------

describe('getSourceOrder()', () => {
  it('returns all three seeded values when all keys are present', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb({
      source_order_1: 'finkel',
      source_order_2: 'verterbukh',
      source_order_3: 'google_translate',
    }));
    const order = await getSourceOrder();
    expect(order).toEqual(['finkel', 'verterbukh', 'google_translate']);
  });

  it('falls back to "none" for missing keys', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb({ source_order_1: 'finkel' }));
    const order = await getSourceOrder();
    expect(order).toEqual(['finkel', 'none', 'none']);
  });

  it('returns ["none","none","none"] when no keys are seeded', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb());
    const order = await getSourceOrder();
    expect(order).toEqual(['none', 'none', 'none']);
  });
});

// ---------------------------------------------------------------------------
// setSourceOrderSlot
// ---------------------------------------------------------------------------

describe('setSourceOrderSlot()', () => {
  it('writes the correct key and value to user_settings', async () => {
    const mockDb = makeMockDb();
    mockGetDatabase.mockReturnValue(mockDb);
    await setSourceOrderSlot(2, 'google_translate');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)',
      ['source_order_2', 'google_translate']
    );
  });

  it('can write "none" to a slot', async () => {
    const mockDb = makeMockDb();
    mockGetDatabase.mockReturnValue(mockDb);
    await setSourceOrderSlot(3, 'none');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.anything(),
      ['source_order_3', 'none']
    );
  });
});

// ---------------------------------------------------------------------------
// getNumericSetting / setNumericSetting
// ---------------------------------------------------------------------------

describe('getNumericSetting()', () => {
  it('returns the stored integer value', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb({ max_saved_entries: '750' }));
    const v = await getNumericSetting('max_saved_entries', 500);
    expect(v).toBe(750);
  });

  it('returns the default when the key is missing', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb());
    const v = await getNumericSetting('max_saved_entries', 500);
    expect(v).toBe(500);
  });

  it('returns the default when the stored value is not a number', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb({ max_saved_entries: 'bad' }));
    const v = await getNumericSetting('max_saved_entries', 500);
    expect(v).toBe(500);
  });
});

describe('setNumericSetting()', () => {
  it('writes the value as a string with INSERT OR REPLACE', async () => {
    const mockDb = makeMockDb();
    mockGetDatabase.mockReturnValue(mockDb);
    await setNumericSetting('max_saved_entries', 750);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)',
      ['max_saved_entries', '750']
    );
  });
});

describe('getMaxSavedEntries()', () => {
  it('defaults to 500 when the key is absent', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb());
    expect(await getMaxSavedEntries()).toBe(500);
  });
});

describe('getLowTokenThreshold()', () => {
  it('defaults to 90 when the key is absent', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb());
    expect(await getLowTokenThreshold()).toBe(90);
  });
});

describe('getCacheTtlDays()', () => {
  it('defaults to 90 when the key is absent', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb());
    expect(await getCacheTtlDays()).toBe(90);
  });
});

describe('getVerterbukhExhaustedAlert() / setVerterbukhExhaustedAlert()', () => {
  it('defaults to false when the key is absent', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb());
    expect(await getVerterbukhExhaustedAlert()).toBe(false);
  });

  it('returns true when the stored value is "1"', async () => {
    mockGetDatabase.mockReturnValue(makeMockDb({ verterbukh_exhausted_alert: '1' }));
    expect(await getVerterbukhExhaustedAlert()).toBe(true);
  });

  it('writes "1" for true and "0" for false', async () => {
    const db = makeMockDb();
    mockGetDatabase.mockReturnValue(db);
    await setVerterbukhExhaustedAlert(true);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.any(String),
      ['verterbukh_exhausted_alert', '1']
    );
    await setVerterbukhExhaustedAlert(false);
    expect(db.runAsync).toHaveBeenCalledWith(
      expect.any(String),
      ['verterbukh_exhausted_alert', '0']
    );
  });
});

describe('clearVerterbukhQuota()', () => {
  it('resets both stored values so getVerterbukhQuota() returns null again', async () => {
    const db = makeMockDb({ verterbukh_quota_used: '4', verterbukh_quota_total: '5' });
    mockGetDatabase.mockReturnValue(db);

    await clearVerterbukhQuota();

    expect(db.runAsync).toHaveBeenCalledWith(expect.any(String), ['verterbukh_quota_used', '-1']);
    expect(db.runAsync).toHaveBeenCalledWith(expect.any(String), ['verterbukh_quota_total', '-1']);
  });

  it('getVerterbukhQuota() returns null after clearing', async () => {
    const rows: Record<string, string> = { verterbukh_quota_used: '4', verterbukh_quota_total: '5' };
    const db = {
      getFirstAsync: jest.fn((_sql: string, params: string[]) => {
        const key = params[0];
        return Promise.resolve(key in rows ? { value: rows[key] } : null);
      }),
      runAsync: jest.fn((_sql: string, params: string[]) => {
        rows[params[0]] = params[1];
        return Promise.resolve({ lastInsertRowId: 1, changes: 1 });
      }),
    };
    mockGetDatabase.mockReturnValue(db);

    expect(await getVerterbukhQuota()).toEqual({ used: 4, total: 5 });
    await clearVerterbukhQuota();
    expect(await getVerterbukhQuota()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// availableOptionsForSlot (pure — no DB)
// ---------------------------------------------------------------------------

describe('availableOptionsForSlot()', () => {
  it('excludes sources used in other slots, keeps sources not used elsewhere', () => {
    // Slot 1 editing; slots 2=verterbukh, 3=google_translate are taken
    const order: SourceSlot[] = ['finkel', 'verterbukh', 'google_translate'];
    const options = availableOptionsForSlot(order, 1);
    expect(options).toContain('finkel');               // not used in any other slot
    expect(options).not.toContain('verterbukh');       // used in slot 2
    expect(options).not.toContain('google_translate'); // used in slot 3
    expect(options).toContain('none');                 // valid — other slots have real sources
  });

  it('includes all sources not used elsewhere', () => {
    // Slot 2 editing; only slot 1=finkel is taken
    const order: SourceSlot[] = ['finkel', 'none', 'none'];
    const options = availableOptionsForSlot(order, 2);
    expect(options).toContain('verterbukh');
    expect(options).toContain('google_translate');
    expect(options).not.toContain('finkel');
  });

  it('includes "none" when at least one other slot has a real source', () => {
    const order: SourceSlot[] = ['finkel', 'none', 'none'];
    const options = availableOptionsForSlot(order, 2);
    expect(options).toContain('none');
  });

  it('excludes "none" when all other slots are already "none"', () => {
    const order: SourceSlot[] = ['finkel', 'none', 'none'];
    const options = availableOptionsForSlot(order, 1);
    expect(options).not.toContain('none');
  });

  it('works correctly for slot 3', () => {
    const order: SourceSlot[] = ['finkel', 'verterbukh', 'none'];
    const options = availableOptionsForSlot(order, 3);
    expect(options).toContain('google_translate');
    expect(options).not.toContain('finkel');
    expect(options).not.toContain('verterbukh');
    expect(options).toContain('none'); // finkel and verterbukh are in other slots, so none is valid
  });
});
