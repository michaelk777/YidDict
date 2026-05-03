import axios from 'axios';
import { DictEntry } from '../types';

const TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Translate a query via the unofficial Google Translate endpoint.
 *
 * Direction is determined by isHebrew:
 *   - Hebrew script (isHebrew=true)  → Yiddish→English  (sl=yi, tl=en)
 *   - Latin input   (isHebrew=false) → English→Yiddish  (sl=en, tl=yi)
 *
 * YIVO romanization is not reliably detected as Yiddish by Google, so Latin
 * input is always treated as English.
 *
 * Returns a single GoogleTranslateEntry, or an empty array if no meaningful
 * translation was produced (translated text equals the query, or request failed).
 */
export async function lookupGoogleTranslate(
  query: string,
  isHebrew: boolean,
): Promise<DictEntry[]> {
  console.log(`[YidDict] googleTranslateService: lookup query="${query}" isHebrew=${isHebrew}`);

  if (isHebrew) {
    const result = await fetchTranslation(query, 'yi', 'en');
    if (!result || !result.translatedText || result.translatedText === query) return [];
    return [{
      yiddishHebrew: query,
      yiddishRomanized: null,
      english: result.translatedText,
      partOfSpeech: null,
      grammaticalInfo: null,
      isPhrase: false,
      exampleYiddish: null,
      exampleEnglish: null,
    }];
  } else {
    const result = await fetchTranslation(query, 'en', 'yi');
    if (!result || !result.translatedText || result.translatedText === query) return [];
    return [{
      yiddishHebrew: result.translatedText,
      yiddishRomanized: null,
      english: query,
      partOfSpeech: null,
      grammaticalInfo: null,
      isPhrase: false,
      exampleYiddish: null,
      exampleEnglish: null,
    }];
  }
}

// ---------------------------------------------------------------------------
// Internal fetch
// ---------------------------------------------------------------------------

interface TranslationResult {
  translatedText: string;
}

async function fetchTranslation(
  query: string,
  sl: string,
  tl: string,
): Promise<TranslationResult | null> {
  try {
    const response = await axios.get<unknown[]>(TRANSLATE_URL, {
      params: { client: 'gtx', sl, tl, dt: 't', q: query },
    });
    const data = response.data;
    const segments = data[0] as unknown[][];
    const translatedText = segments
      .map(seg => (seg[0] as string) ?? '')
      .join('')
      .trim();
    console.log(`[YidDict] googleTranslateService: "${query}" (${sl}→${tl}) → "${translatedText}"`);
    return { translatedText };
  } catch (err) {
    console.error('[YidDict] googleTranslateService: fetch error', err);
    return null;
  }
}
