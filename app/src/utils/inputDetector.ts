// Hebrew Unicode block (letters + points): U+0590–U+05FF
// Hebrew Presentation Forms: U+FB1D–U+FB4F
const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/**
 * Two-valued script type used for history logging.
 *
 * Finkel (and in practice all current sources) accept Hebrew script and Latin
 * input in a single field and auto-detect the script server-side, so no
 * finer distinction is needed right now.
 *
 * NOTE: Verterbukh is Yiddish→English only. If we later need to distinguish
 * YIVO romanization from English input (e.g. to block English queries to
 * Verterbukh), extend this type to 'hebrew' | 'yivo' | 'english' and add
 * a YIVO heuristic (look for zh, tsh, dzh, etc.).
 */
export type QueryScript = 'hebrew' | 'latin';

export function detectInputScript(text: string): QueryScript {
  if (HEBREW_RE.test(text.trim())) return 'hebrew';
  return 'latin';
}
