/**
 * Rule-based standard Yiddish Hebrew-script → YIVO romanization converter.
 *
 * This is an approximation — the UI shows a ~ marker on auto-generated entries.
 * Common loshn-koydesh words with irregular spellings are handled via an
 * exceptions dictionary; all other words go through the rule-based path.
 *
 * Algorithm per word-token:
 *   1. Check exceptions dictionary (whole-word, exact match).
 *   2. Greedily consume the longest matching Hebrew sequence or single letter.
 *
 * Several Hebrew letters are written as a base letter plus a combining
 * diacritic (pasekh-alef, komets-alef, pe with dagesh, pe with rafe, veys) —
 * these are two Unicode code points, so they're matched as sequences
 * alongside the true multi-letter digraphs, not as single-character lookups.
 *
 * Yiddish also has three dedicated ligature letters (tsvey-vovn װ, vov-yud
 * ױ, tsvey-yudn ײ) that are their own single code points, plus a ligature +
 * combining-pasekh sequence for pasekh-tsvey-yudn (ייַ) — these are matched
 * as their own SEQUENCES entries alongside the plain-letter forms, since
 * real-world Yiddish text (e.g. from Verterbukh) mixes both spellings.
 */

// Sequence rules — longest Hebrew code-point sequences first to prevent
// partial matches (e.g. the 3-codepoint "ay" sequence before the 2-codepoint
// "ey" sequence it starts with).
const SEQUENCES: [string, string][] = [
  ['דזש', 'dzh'],   // dzh cluster (rare in native Yiddish)
  ['ייַ', 'ay'],   // pasekh-tsvey-yudn — variant spelled with two plain yud letters
  ['יי',  'ey'],    // tsvey-yudn — variant spelled with two plain yud letters
  ['וי',  'oy'],    // vov-yud
  ['וו',  'v'],     // tsvey-vovn — variant spelled with two plain vov letters
  ['טש',  'tsh'],   // tes + shin
  ['זש',  'zh'],    // zayin + shin
  ['דז',  'dz'],    // dz cluster
  ['אַ',  'a'],     // pasekh-alef
  ['אָ',  'o'],     // komets-alef
  ['פֿ',  'f'],     // fe with rafe
  ['פּ',  'p'],     // pe with dagesh
  ['ײַ', 'ay'],  // pasekh-tsvey-yudn — variant spelled with the dedicated tsvey-yudn ligature letter (ײ)
  ['ײ',  'ey'],    // tsvey-yudn — variant spelled with the dedicated ligature letter
  ['װ',  'v'],     // tsvey-vovn — variant spelled with the dedicated ligature letter
  ['ױ',  'oy'],    // vov-yud — variant spelled with the dedicated ligature letter
  ['בֿ',  'v'],     // veys (beys with rafe)
];

// Single-letter rules. Langer (final) forms map to the same YIVO output as
// their non-final counterpart, since they're the same phoneme.
const CHARS: Record<string, string> = {
  'ב': 'b',
  'ד': 'd',
  'ע': 'e',   // ayin
  'ף': 'f',   // langer fe — ambiguous p/f, defaults to f
  'ג': 'g',
  'ה': 'h',
  'ק': 'k',
  'ל': 'l',
  'מ': 'm',
  'ם': 'm',   // sofit mem
  'נ': 'n',
  'ן': 'n',   // langer nun
  'ר': 'r',
  'ס': 's',
  'ט': 't',
  'ו': 'u',   // melupm-vov
  'ז': 'z',
  'כ': 'kh',  // khof
  'ך': 'kh',  // langer khof
  'צ': 'ts',  // tsadek
  'ץ': 'ts',  // langer tsadek
  'ש': 'sh',  // shin
  'א': 'a',   // bare alef (undotted; defaults to the more common pasekh-alef reading)
  'פ': 'f',   // bare pe (undotted; begadkefat default, matches langer fe / fe-with-rafe)
};

// Whole-word exceptions for loshn-koydesh and other irregular spellings.
// Keys are the standard Hebrew-script spellings.
const EXCEPTIONS: Record<string, string> = {
  'שבת':    'shabos',
  'תורה':   'toyre',
  'גאָט':   'got',
  'ייִד':   'yid',
  'ייִדן':  'yidn',
  'מענטש':  'mentsh',
  'חתונה':  'khasene',
  'מזל':    'mazl',
  'שלום':   'sholem',
};

function convertToken(token: string): string {
  if (EXCEPTIONS[token]) return EXCEPTIONS[token];

  const letters: string[] = [];
  let i = 0;

  while (i < token.length) {
    let matched = false;
    for (const [hebSeq, yivo] of SEQUENCES) {
      if (token.startsWith(hebSeq, i)) {
        letters.push(yivo);
        i += hebSeq.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      if (token[i] === 'י') {
        // Bare yud is ambiguous between the "i" vowel and "y" glide. Word-initial
        // yud is almost always the glide (e.g. "yidish", "yontev"); elsewhere
        // it's almost always the vowel.
        letters.push(i === 0 ? 'y' : 'i');
      } else {
        // Unknown character (ellipsis, apostrophe, digit, etc.) — pass through
        // so that abbreviation patterns survive conversion intact.
        letters.push(CHARS[token[i]] ?? token[i]);
      }
      i++;
    }
  }

  // Return original token if no YIVO letters were produced.
  if (!letters.some(l => /[a-z]/i.test(l))) return token;

  return letters.join('');
}

/**
 * Converts a standard Yiddish Hebrew-script string to YIVO romanization.
 *
 * Returns null if the input is empty or contains no Hebrew characters.
 */
export function hebrewToYivo(hebrew: string): string | null {
  const trimmed = hebrew.trim();
  if (!trimmed) return null;

  // Nothing to convert if the input contains no Hebrew script. Includes the
  // Yiddish ligature letters (U+05F0\u2013U+05F2), which fall outside the plain
  // Hebrew alphabet block.
  if (!/[\u05D0-\u05EA\u05F0-\u05F2]/.test(trimmed)) return null;

  // Split on whitespace and hyphens, preserving the separators.
  const parts = trimmed.split(/([\s-]+)/);
  const converted = parts.map((part, i) => {
    if (i % 2 === 1) return part;           // separator — keep as-is
    return part ? convertToken(part) : '';
  });

  const result = converted.join('');
  if (!/[a-zA-Z]/.test(result)) return null;
  return result;
}
