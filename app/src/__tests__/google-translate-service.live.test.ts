/**
 * google-translate-service.live.test.ts
 *
 * Live integration tests for the Google Translate endpoint.
 * These make REAL network requests and are excluded from the normal test run.
 *
 * Run explicitly before each release with:
 *   npm run test:live
 *
 * Purpose: verify that the unofficial Google Translate endpoint is still reachable
 * and that the response format (`data[0][i][0]`) hasn't changed. We check structure
 * and script (Latin vs. Hebrew), not exact translation strings — output varies.
 */

import { lookupGoogleTranslate } from '../services/google-translate-service';

jest.setTimeout(15000);

// ---------------------------------------------------------------------------
// Yiddish (Hebrew script) → English
// ---------------------------------------------------------------------------

describe('live: lookupGoogleTranslate — Yiddish → English', () => {
  let results: Awaited<ReturnType<typeof lookupGoogleTranslate>>;

  beforeAll(async () => {
    results = await lookupGoogleTranslate('שיין', true);
  });

  it('returns at least one result', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('english field is a non-empty string', () => {
    expect(typeof results[0].english).toBe('string');
    expect(results[0].english!.length).toBeGreaterThan(0);
  });

  it('english field contains Latin characters (not returned in Hebrew)', () => {
    expect(results[0].english).toMatch(/[a-zA-Z]/);
  });

  it('yiddishHebrew is set to the original query', () => {
    expect(results[0].yiddishHebrew).toBe('שיין');
  });

  it('source is google_translate and fromCache is false', () => {
    expect(results[0].source).toBe('google_translate');
    expect(results[0].fromCache).toBe(false);
  });

  it('grammar fields are null', () => {
    expect(results[0].partOfSpeech).toBeNull();
    expect(results[0].grammaticalInfo).toBeNull();
  });
});

describe('live: lookupGoogleTranslate — multi-word Yiddish phrase', () => {
  it('returns a result for גוט מאָרגן (good morning)', async () => {
    const results = await lookupGoogleTranslate('גוט מאָרגן', true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].english).toMatch(/[a-zA-Z]/);
  });
});

// ---------------------------------------------------------------------------
// English → Yiddish (Hebrew script)
// ---------------------------------------------------------------------------

describe('live: lookupGoogleTranslate — English → Yiddish', () => {
  let results: Awaited<ReturnType<typeof lookupGoogleTranslate>>;

  beforeAll(async () => {
    results = await lookupGoogleTranslate('hello', false);
  });

  it('returns at least one result', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('yiddishHebrew contains Hebrew script characters', () => {
    expect(results[0].yiddishHebrew).toMatch(/[א-ת]/);
  });

  it('english is set to the original query', () => {
    expect(results[0].english).toBe('hello');
  });

  it('source is google_translate and fromCache is false', () => {
    expect(results[0].source).toBe('google_translate');
    expect(results[0].fromCache).toBe(false);
  });

  it('grammar fields are null', () => {
    expect(results[0].partOfSpeech).toBeNull();
    expect(results[0].grammaticalInfo).toBeNull();
  });
});

describe('live: lookupGoogleTranslate — another English word', () => {
  it('returns a result for "book" with Hebrew output', async () => {
    const results = await lookupGoogleTranslate('book', false);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].yiddishHebrew).toMatch(/[א-ת]/);
    expect(results[0].english).toBe('book');
  });
});
