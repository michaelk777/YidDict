/**
 * google-translate-service.test.ts
 *
 * Tests for the Google Translate lookup logic.
 * Axios is mocked — no network access.
 */

import axios from 'axios';
import { lookupGoogleTranslate } from '../services/google-translate-service';

jest.mock('axios');

const mockGet = axios.get as jest.Mock;

/** Build a minimal Google Translate API response. */
function gtResponse(translatedText: string) {
  return { data: [[[translatedText, 'original']], null, null] };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Hebrew script input → English (sl=yi, tl=en)
// ---------------------------------------------------------------------------

describe('lookupGoogleTranslate — Hebrew script input', () => {
  it('calls the API with sl=yi and tl=en', async () => {
    mockGet.mockResolvedValueOnce(gtResponse('pretty'));

    await lookupGoogleTranslate('שיין', true);

    expect(mockGet).toHaveBeenCalledWith(
      'https://translate.googleapis.com/translate_a/single',
      { params: { client: 'gtx', sl: 'yi', tl: 'en', dt: 't', q: 'שיין' } },
    );
  });

  it('returns the English translation with yiddishHebrew set to the query', async () => {
    mockGet.mockResolvedValueOnce(gtResponse('pretty'));

    const results = await lookupGoogleTranslate('שיין', true);

    expect(results).toHaveLength(1);
    expect(results[0].english).toBe('pretty');
    expect(results[0].yiddishHebrew).toBe('שיין');
    expect(results[0].yiddishRomanized).toBeNull();
  });

  it('sets partOfSpeech, conjugationInfo, and isPhrase to null/false', async () => {
    mockGet.mockResolvedValueOnce(gtResponse('pretty'));

    const results = await lookupGoogleTranslate('שיין', true);

    expect(results[0].partOfSpeech).toBeNull();
    expect(results[0].grammaticalInfo).toBeNull();
    expect(results[0].isPhrase).toBe(false);
  });

  it('returns empty array when translated text equals the query', async () => {
    mockGet.mockResolvedValueOnce(gtResponse('שיין'));

    const results = await lookupGoogleTranslate('שיין', true);
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Latin (English) input → Yiddish (sl=en, tl=yi)
// ---------------------------------------------------------------------------

describe('lookupGoogleTranslate — Latin (English) input', () => {
  it('calls the API with sl=en and tl=yi', async () => {
    mockGet.mockResolvedValueOnce(gtResponse('שיין'));

    await lookupGoogleTranslate('pretty', false);

    expect(mockGet).toHaveBeenCalledWith(
      'https://translate.googleapis.com/translate_a/single',
      { params: { client: 'gtx', sl: 'en', tl: 'yi', dt: 't', q: 'pretty' } },
    );
  });

  it('returns yiddishHebrew from the translation and english set to the original query', async () => {
    mockGet.mockResolvedValueOnce(gtResponse('שיין'));

    const results = await lookupGoogleTranslate('pretty', false);

    expect(results).toHaveLength(1);
    expect(results[0].yiddishHebrew).toBe('שיין');
    expect(results[0].english).toBe('pretty');
    expect(results[0].yiddishRomanized).toBeNull();
  });

  it('returns empty array when translated text equals the query', async () => {
    mockGet.mockResolvedValueOnce(gtResponse('pretty'));

    const results = await lookupGoogleTranslate('pretty', false);
    expect(results).toHaveLength(0);
  });

  it('only makes one API call', async () => {
    mockGet.mockResolvedValueOnce(gtResponse('שיין'));

    await lookupGoogleTranslate('pretty', false);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Multi-segment response
// ---------------------------------------------------------------------------

describe('lookupGoogleTranslate — multi-segment response', () => {
  it('joins multiple translation segments into a single string', async () => {
    const multiSegment = { data: [[['good', ''], [' day', '']], null, null] };
    mockGet.mockResolvedValueOnce(multiSegment);

    const results = await lookupGoogleTranslate('גוט טאָג', true);
    expect(results[0].english).toBe('good day');
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('lookupGoogleTranslate — error handling', () => {
  it('returns empty array when the fetch throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network Error'));

    const results = await lookupGoogleTranslate('שיין', true);
    expect(results).toHaveLength(0);
  });
});
