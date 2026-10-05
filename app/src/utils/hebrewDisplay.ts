const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

export function toSuperscript(s: string): string {
  return s.split('').map(c => SUPERSCRIPT_DIGITS[c] ?? c).join('');
}

/** Splits a Hebrew lemma with an optional /N homograph suffix into base text and superscript. */
export function splitHebrewLemma(lemma: string): { text: string; sup?: string } {
  const slash = lemma.lastIndexOf('/');
  if (slash === -1) return { text: lemma };
  const after = lemma.slice(slash + 1);
  if (/^\d+$/.test(after)) return { text: lemma.slice(0, slash), sup: after };
  return { text: lemma };
}

/** Returns the Hebrew lemma string with any /N homograph suffix converted to Unicode superscript. */
export function formatHebrewLemma(lemma: string | null | undefined): string {
  if (!lemma) return '';
  const { text, sup } = splitHebrewLemma(lemma);
  return text + (sup ? toSuperscript(sup) : '');
}

// Unicode bidi isolate marks (LRI/PDI) — same mechanism used in
// verterbukh-service.ts, just for an LTR label instead of an RTL phrase.
// Forces "(partial)" to render as plain, correctly-ordered Latin text
// (including its parentheses, which bidi would otherwise mirror) regardless
// of the RTL Hebrew text directly before it.
const LRI = '⁦';
const PDI = '⁩';

/**
 * Appends a "(partial)" label when a Finkel phrase's Hebrew only covers one
 * word of the full phrase (see DictEntry.hebrewIsPartial) — the rest of the
 * phrase has no matching Hebrew at all. Returns the Hebrew unchanged when
 * not partial.
 */
export function markPartialHebrew(
  yiddishHebrew: string | null,
  hebrewIsPartial: boolean | undefined
): string | null {
  if (!yiddishHebrew || !hebrewIsPartial) return yiddishHebrew;
  return `${yiddishHebrew} ${LRI}(partial)${PDI}`;
}
