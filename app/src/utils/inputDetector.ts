// Hebrew Unicode block (letters + points): U+0590–U+05FF
// Hebrew Presentation Forms: U+FB1D–U+FB4F
import { log } from './logger';

const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/**
 * Two-valued script type used for history logging.
 *
 * Finkel (and in practice all current sources) accept Hebrew script and Latin
 * input in a single field and auto-detect the script server-side, so no
 * finer distinction is needed right now.
 *
 * NOTE: Verterbukh is bidirectional. For Latin input it auto-detects direction
 * internally: tries dir=from (Yiddish→English) first; if empty, retries with
 * dir=to (English→Yiddish). No finer 'yivo' | 'english' distinction needed here.
 */
export type QueryScript = 'hebrew' | 'latin';

export function detectInputScript(text: string): QueryScript {
  const script: QueryScript = HEBREW_RE.test(text.trim()) ? 'hebrew' : 'latin';
  log(`[YidDict] inputDetector: detected script "${script}"`);
  return script;
}
