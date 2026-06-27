/**
 * Rule-based YIVO transliteration → standard Yiddish Hebrew-script converter.
 *
 * This is an approximation — the UI shows a ~ marker on auto-generated entries.
 * Common loshn-koydesh words with irregular spellings are handled via an
 * exceptions dictionary; all other words go through the rule-based path.
 *
 * Algorithm per word-token:
 *   1. Check exceptions dictionary (whole-word, case-insensitive).
 *   2. Greedily consume the longest matching YIVO digraph or single letter.
 *   3. Apply Hebrew final (sofit) forms to the last letter.
 */

// Digraph rules — longest patterns first to prevent partial matches (e.g. "tsh" before "sh").
const DIGRAPHS: [string, string][] = [
  ['tsh', 'טש'],    // tes + shin
  ['kh',  'כ'],     // khof (sofit: ך)
  ['sh',  'ש'],     // shin
  ['ts',  'צ'],     // tsadek (sofit: ץ)
  ['zh',  'זש'],    // zayin + shin
  ['ay',  'ייַ'], // pasekh-tsvey-yudn (yud yud pasekh)
  ['ey',  'יי'],    // tsvey-yudn
  ['oy',  'וי'],    // vov + yud
  ['dz',  'דז'],    // dz cluster
];

// Single-letter rules.
const CHARS: Record<string, string> = {
  a: 'אַ',   // pasekh-alef
  b: 'ב',
  d: 'ד',
  e: 'ע',         // ayin
  f: 'פֿ',  // fe with rafe
  g: 'ג',
  h: 'ה',
  i: 'י',
  j: 'דזש',       // dzsh (rare in native Yiddish)
  k: 'ק',
  l: 'ל',
  m: 'מ',         // sofit: ם
  n: 'נ',         // sofit: ן
  o: 'אָ',  // komets-alef
  p: 'פּ',  // pe with dagesh
  r: 'ר',
  s: 'ס',
  t: 'ט',
  u: 'ו',         // melupm-vov
  v: 'וו',        // tsvey-vovn
  y: 'י',
  z: 'ז',
};

// Final-form replacements — applied to the last phoneme of each token.
const SOFIT: Record<string, string> = {
  'כ':         'ך',
  'צ':         'ץ',
  'מ':         'ם',
  'נ':         'ן',
  [`פּ`]: 'ף',  // pe+dagesh → final pe
  [`פֿ`]: 'ף',  // fe+rafe  → final pe
};

// Whole-word exceptions for loshn-koydesh and other irregular spellings.
// Keys are lowercase YIVO transliteration.
const EXCEPTIONS: Record<string, string> = {
  'shabos':  'שבת',
  'shabat':  'שבת',
  'toyre':   'תורה',
  'got':     'גאָט',
  'yid':     'ייִד',
  'yidn':    'ייִדן',
  'mentsh':  'מענטש',
  'khasene': 'חתונה',
  'mazl':    'מזל',
  'sholem':  'שלום',
};

function convertToken(token: string): string {
  const lower = token.toLowerCase();
  if (EXCEPTIONS[lower]) return EXCEPTIONS[lower];

  const phonemes: string[] = [];
  let i = 0;

  while (i < lower.length) {
    let matched = false;
    for (const [yivoSeq, heb] of DIGRAPHS) {
      if (lower.startsWith(yivoSeq, i)) {
        phonemes.push(heb);
        i += yivoSeq.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Unknown character (ellipsis, apostrophe, digit, etc.) — pass through
      // so that abbreviation patterns like "ge...t" survive conversion intact.
      phonemes.push(CHARS[lower[i]] ?? lower[i]);
      i++;
    }
  }

  // Return original token if no Hebrew characters were produced.
  if (!phonemes.some(p => /[א-ת]/.test(p))) return token;

  // Apply sofit to the last Hebrew phoneme, scanning backwards past any
  // trailing pass-through characters (e.g. the dots in "גע...ט").
  for (let j = phonemes.length - 1; j >= 0; j--) {
    if (SOFIT[phonemes[j]]) { phonemes[j] = SOFIT[phonemes[j]]; break; }
    if (/[א-ת]/.test(phonemes[j])) break; // Hebrew but no sofit form — stop
  }

  return phonemes.join('');
}

/**
 * Converts a YIVO transliteration string to standard Yiddish Hebrew script.
 *
 * Returns null if the input is empty or already contains Hebrew characters.
 */
export function yivoToHebrew(yivo: string): string | null {
  const trimmed = yivo.trim();
  if (!trimmed) return null;

  // Don't re-convert strings that already contain Hebrew script.
  if (/[א-ת]/.test(trimmed)) return null;

  // Split on whitespace and hyphens, preserving the separators.
  // e.g. "shabes-tish" → ["shabes", "-", "tish"]
  const parts = trimmed.split(/([\s-]+)/);
  const converted = parts.map((part, i) => {
    if (i % 2 === 1) return part;           // separator — keep as-is
    return part ? convertToken(part) : '';
  });

  const result = converted.join('');
  if (!/[א-ת]/.test(result)) return null;
  return result;
}
