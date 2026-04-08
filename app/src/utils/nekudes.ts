// Hebrew diacritical marks (nekudes/nikkud): Unicode U+05B0–U+05C7
// Covers: sheva, hataf variants, hiriq, tsere, segol, patah, qamats,
//         holam, qubuts, dagesh/mapiq, shin dot, sin dot, rafe, and qamats qatan.
// Finkel's server handles nekudes internally, but stripping them first
// improves cache key consistency when users type with or without points.
const NEKUDES_RE = /[\u05B0-\u05C7]/g;

export function stripNekudes(text: string): string {
  const stripped = text.replace(NEKUDES_RE, '');
  if (stripped !== text) {
    console.log('[YidDict] nekudes: stripped diacriticals from input');
  }
  return stripped;
}
