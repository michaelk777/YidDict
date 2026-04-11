import { getDatabase } from './database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DictSource = 'finkel' | 'verterbukh' | 'google_translate';
export type SourceSlot = DictSource | 'none';
export type SlotIndex = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Source order
// ---------------------------------------------------------------------------

/**
 * Returns the user's configured source lookup order as a 3-element array.
 * Each element is a DictSource or 'none'. Defaults to the seeded values
 * (finkel → verterbukh → google_translate) if the keys aren't in the DB.
 */
export async function getSourceOrder(): Promise<SourceSlot[]> {
  console.log('[YidDict] settingsDb: getSourceOrder');
  const db = getDatabase();
  const order: SourceSlot[] = [];
  for (const slot of [1, 2, 3] as SlotIndex[]) {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM user_settings WHERE key = ?',
      [`source_order_${slot}`]
    );
    order.push((row?.value ?? 'none') as SourceSlot);
  }
  console.log(`[YidDict] settingsDb: order = ${order.join(' → ')}`);
  return order;
}

/**
 * Persists the source selection for a single slot (1, 2, or 3).
 * Uses INSERT OR REPLACE so the key is created on first write if needed.
 */
export async function setSourceOrderSlot(slot: SlotIndex, value: SourceSlot): Promise<void> {
  console.log(`[YidDict] settingsDb: setSourceOrderSlot slot=${slot} value="${value}"`);
  const db = getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)',
    [`source_order_${slot}`, value]
  );
}

// ---------------------------------------------------------------------------
// Helpers (pure — usable in UI logic without hitting the DB)
// ---------------------------------------------------------------------------

export const ALL_SOURCES: DictSource[] = ['finkel', 'verterbukh', 'google_translate'];

export const SOURCE_LABELS: Record<DictSource | 'none', string> = {
  finkel: 'Finkel',
  verterbukh: 'Verterbukh',
  google_translate: 'Google Translate',
  none: 'None',
};

/**
 * Returns the valid choices a user can pick for a given slot, given the
 * current full order. Rules:
 * - A real source is available if it isn't already used in another slot.
 * - 'none' is available only when at least one other slot has a real source
 *   (so the user can't zero-out all three slots).
 */
export function availableOptionsForSlot(order: SourceSlot[], slot: SlotIndex): SourceSlot[] {
  const others = order.filter((_, i) => i !== slot - 1);
  const usedElsewhere = new Set(others.filter(s => s !== 'none'));

  const options: SourceSlot[] = ALL_SOURCES.filter(s => !usedElsewhere.has(s));

  if (others.some(s => s !== 'none')) {
    options.push('none');
  }

  return options;
}
