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
