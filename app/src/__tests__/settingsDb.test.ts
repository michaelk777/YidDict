/**
 * settingsDb.test.ts
 *
 * Unit tests for getSourceOrder, setSourceOrderSlot, and the pure helper
 * availableOptionsForSlot. expo-sqlite is auto-mocked.
 */

jest.mock('expo-sqlite');
jest.mock('../db/database');

import { getSourceOrder, setSourceOrderSlot, availableOptionsForSlot, SourceSlot } from '../db/settingsDb';
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
