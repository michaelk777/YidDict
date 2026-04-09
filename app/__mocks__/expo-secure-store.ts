// Manual mock for expo-secure-store used in Jest tests.
// Tests can configure the in-memory store via __setStore / __getStore.
const store: Record<string, string> = {};

export const setItemAsync = jest.fn(async (key: string, value: string) => {
  store[key] = value;
});

export const getItemAsync = jest.fn(async (key: string): Promise<string | null> => {
  return store[key] ?? null;
});

export const deleteItemAsync = jest.fn(async (key: string) => {
  delete store[key];
});

/** Test helper — reset the in-memory store between tests. */
export function __resetStore() {
  Object.keys(store).forEach(k => delete store[k]);
}
