/**
 * Shared result type used across all dictionary sources.
 *
 * Fields populated per source:
 *   Finkel:          yiddishHebrew, yiddishTransliterated, english, partOfSpeech, grammaticalInfo, isPhrase
 *   Verterbukh:      yiddishHebrew, yiddishTransliterated, english, partOfSpeech, grammaticalInfo
 *   Google Translate: yiddishHebrew, english
 *
 * Fields not populated by a given source are null (or false for isPhrase).
 */
export interface DictEntry {
  source: 'finkel' | 'verterbukh' | 'google_translate';
  fromCache: boolean;
  yiddishHebrew: string | null;
  yiddishTransliterated: string | null;
  english: string | null;
  partOfSpeech: string | null;
  grammaticalInfo: string | null;
  isPhrase: boolean;
  hebrewIsGenerated?: boolean;
  transliteratedIsGenerated?: boolean;
  // A Finkel phrase's Hebrew may not cover the full phrase if the rest has
  // no Hebrew text. Unset if fully covered.
  hebrewIsPartial?: boolean;
  // The one word of yiddishTransliterated that yiddishHebrew actually
  // covers, when hebrewIsPartial is true — lets the "YIVO → Hebrew" toggle
  // splice generated Hebrew around the real Hebrew instead of discarding
  // it. Not persisted for saved entries; live-search use only.
  hebrewCoveredWord?: string;
}
