/**
 * Shared result type used across all dictionary sources.
 *
 * Fields populated per source:
 *   Finkel:          yiddishHebrew, yiddishRomanized, english, partOfSpeech, grammaticalInfo, isPhrase
 *   Verterbukh:      yiddishHebrew, yiddishRomanized, english, partOfSpeech, grammaticalInfo
 *   Google Translate: yiddishHebrew, english
 *
 * Fields not populated by a given source are null (or false for isPhrase).
 */
export interface DictEntry {
  source: 'finkel' | 'verterbukh' | 'google_translate';
  fromCache: boolean;
  yiddishHebrew: string | null;
  yiddishRomanized: string | null;
  english: string | null;
  partOfSpeech: string | null;
  grammaticalInfo: string | null;
  isPhrase: boolean;
  hebrewIsGenerated?: boolean;
}
