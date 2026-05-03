/**
 * Shared result type used across all dictionary sources.
 *
 * Fields populated per source:
 *   Finkel:          yiddishHebrew, yiddishRomanized, english, partOfSpeech, grammaticalInfo, isPhrase
 *   Verterbukh:      yiddishHebrew, yiddishRomanized, english, partOfSpeech, grammaticalInfo, exampleYiddish, exampleEnglish
 *   Google Translate: yiddishHebrew, english
 *
 * Fields not populated by a given source are null (or false for isPhrase).
 * exampleYiddish/exampleEnglish are not persisted to the SQLite cache;
 * they are available on live lookups only.
 */
export interface DictEntry {
  yiddishHebrew: string | null;
  yiddishRomanized: string | null;
  english: string | null;
  partOfSpeech: string | null;
  grammaticalInfo: string | null;
  isPhrase: boolean;
  exampleYiddish: string | null;
  exampleEnglish: string | null;
}
