import axios from 'axios';
import { parse, HTMLElement, Node } from 'node-html-parser';
import { stripNekudes } from '../utils/nekudes';
import { yivoToHebrew } from '../utils/yivoToHebrew';
import { DictEntry } from '../types';

const FINKEL_URL =
  'https://www.cs.engr.uky.edu/~raphael/yiddish/dictionary.cgi';

/**
 * Look up a word in Finkel's dictionary.
 *
 * Strategy (combining all three Finkel form fields into one call):
 *   1. POST word=<query>  — fragment/partial match, handles Hebrew, YIVO, English
 *   2. If no results, POST base=<query> — stem lookup from an inflected form
 *      (e.g. user typed "sheyne" → server finds "sheyn")
 *
 * wholeWord is not used by default; partial matching is more useful in an
 * interactive app. It can be wired as a setting in a later phase.
 *
 * Hebrew input has nekudes stripped before sending; Finkel handles this
 * server-side too, but stripping first normalises the cache key.
 */
export async function lookupFinkel(
  query: string,
  isHebrew = false
): Promise<DictEntry[]> {
  const word = isHebrew ? stripNekudes(query) : query;
  console.log(`[YidDict] finkelService: lookupFinkel query="${word}" isHebrew=${isHebrew}`);

  // Stage 1: fragment match
  console.log('[YidDict] finkelService: stage 1 — POST word=<query>');
  const stage1 = await postToFinkel({ word });
  console.log(`[YidDict] finkelService: stage 1 returned ${stage1.length} result(s)`);
  if (stage1.length > 0) return stage1;

  // Stage 2: inflected-form → stem lookup
  console.log('[YidDict] finkelService: stage 1 empty, falling back to stage 2 — POST base=<query>');
  const stage2 = await postToFinkel({ base: word });
  console.log(`[YidDict] finkelService: stage 2 returned ${stage2.length} result(s)`);
  return stage2;
}

async function postToFinkel(
  params: Record<string, string>
): Promise<DictEntry[]> {
  console.log(`[YidDict] finkelService: POST to Finkel params=${JSON.stringify(params)}`);
  const body = new URLSearchParams(params).toString();
  const response = await axios.post<string>(FINKEL_URL, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  console.log('[YidDict] finkelService: Finkel responded, parsing HTML');
  return parseFinkelHtml(response.data);
}

// ---------------------------------------------------------------------------
// HTML parser
// ---------------------------------------------------------------------------

export function parseFinkelHtml(html: string): DictEntry[] {
  const root = parse(html);

  // Results live in the first <ul> that contains at least one .definition span.
  // When there are no results, no such <ul> exists.
  const uls = root.querySelectorAll('ul');
  let resultUl: HTMLElement | null = null;
  for (const ul of uls) {
    if (ul.querySelector('.definition')) {
      resultUl = ul;
      break;
    }
  }
  if (!resultUl) return [];

  const entries: DictEntry[] = [];
  collectEntries(directLiChildren(resultUl), false, entries);
  console.log(`[YidDict] finkelService: parseFinkelHtml found ${entries.length} entr(ies)`);
  return entries;
}

/** Returns the direct <li> children of a parent element. */
function directLiChildren(parent: HTMLElement): HTMLElement[] {
  return parent.childNodes.filter(
    (n): n is HTMLElement =>
      (n as HTMLElement).tagName === 'LI'
  ) as HTMLElement[];
}

/**
 * Returns the first direct-child element with the given class, or null.
 * Using childNodes iteration avoids descending into nested <ul> sub-entries.
 */
function directChildByClass(
  li: HTMLElement,
  className: string
): HTMLElement | null {
  for (const child of li.childNodes) {
    const el = child as HTMLElement;
    if (el.tagName && el.classList?.contains(className)) return el;
  }
  return null;
}

/**
 * Returns the base Hebrew form for a headword — the first <span class="hebrew">
 * that appears before any grammar span. Hebrew spans that appear after a grammar
 * span are inflected forms (e.g. plural), not the base form; those are captured
 * via the 'hebrew' event in collectEvents instead.
 *
 * Returns null when no Hebrew span precedes the first grammar span (e.g. entries
 * that exist only in plural form, like hoyries, where the sole Hebrew span is the
 * plural form inside the "plural" grammar context).
 */
function baseHebrewOf(li: HTMLElement): string | null {
  for (const child of li.childNodes) {
    const el = child as HTMLElement;
    if (!el.tagName) continue;
    if (el.classList?.contains('grammar')) break;
    if (el.classList?.contains('hebrew')) return el.text.trim() || null;
  }
  return null;
}

function collectEntries(
  lis: HTMLElement[],
  isPhrase: boolean,
  out: DictEntry[]
): void {
  for (const li of lis) {
    const lexemeSpan = directChildByClass(li, 'lexeme');

    if (!lexemeSpan) {
      // Phrase container: has a nested <ul> but no direct .lexeme child.
      const nestedUl = li.querySelector('ul');
      if (nestedUl) collectEntries(directLiChildren(nestedUl), true, out);
      continue;
    }

    // Base transliterated: strip trailing '(' that Finkel appends before a Hebrew span.
    const baseTransliterated = lexemeSpan.text.replace(/\($/, '').trim() || null;
    // Base Hebrew: only the span that precedes the first grammar span.
    // Spans appearing after a grammar span are inflected forms captured via events.
    const baseHebrew = baseHebrewOf(li);

    out.push(...parseEntryChildren(li.childNodes, baseTransliterated, baseHebrew, isPhrase));

    // Some entries have phrase sub-entries in an inline nested <ul>.
    const inlineUl = (li.childNodes as Node[]).find(
      n => (n as HTMLElement).tagName === 'UL'
    ) as HTMLElement | undefined;
    if (inlineUl) collectEntries(directLiChildren(inlineUl), true, out);
  }
}

// ---------------------------------------------------------------------------
// Child-node state machine
// ---------------------------------------------------------------------------

type Ev =
  | { kind: 'grammar'; text: string }
  | { kind: 'def';    text: string }
  | { kind: 'source'; text: string }
  | { kind: 'bare';   text: string }
  | { kind: 'hebrew'; text: string }
  | { kind: 'skip' };

/** Tag every direct child node of an <li> into a flat event list. */
function collectEvents(nodes: Node[]): Ev[] {
  const events: Ev[] = [];
  for (const node of nodes) {
    const el = node as HTMLElement;
    if (el.tagName) {
      if (el.tagName === 'UL') {
        events.push({ kind: 'skip' });
      } else {
        const cls = el.classList;
        if (!cls || cls.contains('lexeme')) {
          events.push({ kind: 'skip' });
        } else if (cls.contains('grammar')) {
          events.push({ kind: 'grammar', text: el.text.trim() });
        } else if (cls.contains('definition')) {
          events.push({ kind: 'def', text: el.text.trim() });
        } else if (cls.contains('source')) {
          events.push({ kind: 'source', text: el.text.trim() });
        } else if (cls.contains('hebrew')) {
          // Hebrew spans outside the lexeme carry inflected forms (e.g. plural).
          // Captured here so the grammar-context plural span can enrich yiddishHebrew.
          events.push({ kind: 'hebrew', text: el.text.trim() });
        } else if (cls.contains('weakmatch') || cls.contains('goodmatch')) {
          // Highlighting spans — their text is real content (e.g. the root portion
          // of a plural form like "<weakmatch>kapore</weakmatch>s").
          events.push({ kind: 'bare', text: el.text });
        } else {
          events.push({ kind: 'skip' });
        }
      }
    } else {
      events.push({ kind: 'bare', text: node.text ?? '' });
    }
  }
  return events;
}

/**
 * Find indices in the event list where a multi-entry split begins.
 *
 * A split is triggered at the index of a bare-text node that looks like a new
 * headword (contains alphabetic characters) and satisfies:
 *   word-like bare text → ≥1 grammar event → definition event
 * all appearing after a prior definition event. All three conditions together
 * prevent false splits on punctuation or grammar-only elaborations.
 */
function findSplitIndices(events: Ev[]): number[] {
  const splits: number[] = [];
  const defAt = events.reduce<number[]>(
    (acc, ev, i) => (ev.kind === 'def' ? [...acc, i] : acc),
    []
  );

  for (let di = 0; di < defAt.length - 1; di++) {
    let wordIdx = -1;
    let hasGrammar = false;

    for (let j = defAt[di] + 1; j < events.length; j++) {
      const ev = events[j];
      if (ev.kind === 'def') {
        if (wordIdx >= 0 && hasGrammar) splits.push(wordIdx);
        break;
      }
      if (ev.kind === 'grammar') {
        if (wordIdx >= 0) {
          hasGrammar = true;
        } else {
          // Grammar before any word-like text — not a split; reset.
          wordIdx = -1;
          hasGrammar = false;
        }
      }
      if (ev.kind === 'bare' && wordIdx < 0) {
        if (/[a-zA-Zא-תיִ-פֿ]/.test(ev.text)) wordIdx = j;
      }
    }
  }
  return splits;
}

/**
 * Process a slice of events into grammar lines, an English definition, and
 * source labels.
 *
 * Secondary definitions — .definition spans that appear before the last
 * definition in the segment, while a grammar span is pending — are appended
 * to the grammar line they follow rather than becoming the English gloss.
 * This handles cases like: grammar "adjectival form with '-ish'," →
 * def "skeletal" (secondary) → def "skeleton" (main English).
 */
function processSegmentEvents(slice: Ev[]): {
  grammarLines: Array<{ span: string; bare: string; hebrew: string }>;
  english: string | null;
  sources: string[];
} {
  const lastDefIdx = slice.reduce((last, ev, i) => (ev.kind === 'def' ? i : last), -1);
  const grammarLines: Array<{ span: string; bare: string; hebrew: string }> = [];
  let pendingSpan: string | null = null;
  let pendingBare = '';
  let pendingHebrew = '';
  let english: string | null = null;
  const sources: string[] = [];

  for (let i = 0; i < slice.length; i++) {
    const ev = slice[i];
    switch (ev.kind) {
      case 'grammar':
        if (pendingSpan !== null) grammarLines.push({ span: pendingSpan, bare: pendingBare, hebrew: pendingHebrew });
        pendingSpan = ev.text;
        pendingBare = '';
        pendingHebrew = '';
        break;

      case 'def':
        if (pendingSpan !== null && i < lastDefIdx) {
          // Secondary definition: append text to current grammar line's bare.
          pendingBare += ev.text;
        } else {
          if (pendingSpan !== null) {
            grammarLines.push({ span: pendingSpan, bare: pendingBare, hebrew: pendingHebrew });
            pendingSpan = null;
            pendingBare = '';
            pendingHebrew = '';
          }
          if (english === null) english = ev.text || null;
        }
        break;

      case 'bare':
        if (pendingSpan !== null) pendingBare += ev.text;
        break;

      case 'hebrew':
        if (pendingSpan === 'plural') pendingHebrew += ev.text;
        break;

      case 'source':
        sources.push(ev.text);
        break;

      default:
        break;
    }
  }
  if (pendingSpan !== null) grammarLines.push({ span: pendingSpan, bare: pendingBare, hebrew: pendingHebrew });

  return { grammarLines, english, sources };
}

/**
 * Format one grammar line from its span text and accumulated bare text.
 *
 * When bare content is present, the span's trailing comma acts as a natural
 * separator (e.g. "adjectival form with '-ish', skeletal"), so it is kept.
 * When bare content is empty, the trailing comma is spurious and stripped
 * (e.g. "gender f," → "gender f").
 */
function formatGrammarLine(span: string, bare: string): string {
  const cleaned = bare.trim().replace(/,\s*$/, '').trim();
  if (cleaned) return `${span} "${cleaned}"`;
  return span.replace(/,\s*$/, '').trim();
}

/** Strip trailing comma and whitespace from bare text. */
function cleanBare(s: string): string {
  return s.trim().replace(/,\s*$/, '').trim();
}

function parseEntryChildren(
  nodes: Node[],
  baseTransliterated: string | null,
  baseHebrew: string | null,
  isPhrase: boolean
): DictEntry[] {
  const events = collectEvents(nodes);
  const splitIndices = findSplitIndices(events);

  // Partition events into per-entry segments at each split point.
  const segments: Array<{ lexeme: string | null; hebrew: string | null; slice: Ev[] }> = [];
  let start = 0;
  let segLexeme = baseTransliterated;
  let segHebrew = baseHebrew;

  for (const splitIdx of splitIndices) {
    segments.push({ lexeme: segLexeme, hebrew: segHebrew, slice: events.slice(start, splitIdx) });
    const wordEv = events[splitIdx];
    segLexeme =
      wordEv.kind === 'bare'
        ? wordEv.text.trim().replace(/[,.\s]+$/, '').trim() || null
        : null;
    segHebrew = null;
    start = splitIdx + 1;
  }
  segments.push({ lexeme: segLexeme, hebrew: segHebrew, slice: events.slice(start) });

  return segments.map(seg =>
    buildEntryFromSegment(seg.lexeme, seg.hebrew, seg.slice, isPhrase)
  );
}

function buildEntryFromSegment(
  lexeme: string | null,
  hebrew: string | null,
  slice: Ev[],
  isPhrase: boolean
): DictEntry {
  const { grammarLines, english, sources } = processSegmentEvents(slice);

  // Headword enrichment: find the first grammar line that matches a trigger.
  // Only the first match is applied. Track the index and the replacement text
  // so the matched line can be simplified in the grammar display — the form
  // value is already captured in the headword.
  //
  //   plural in  → strip to base POS ("noun, plural in" → "noun")
  //   participle → drop entirely (null)
  //   with stem  → keep span as-is, strip only the bare stem value
  let yiddishTransliterated = lexeme;
  let yiddishHebrew = hebrew;
  let enrichedLineIndex = -1;
  let enrichedLineReplacement: string | null = null;

  for (let i = 0; i < grammarLines.length; i++) {
    const { span, bare, hebrew } = grammarLines[i];
    const b = cleanBare(bare);

    if (span.includes('plural in') && b.startsWith('-')) {
      if (yiddishTransliterated) yiddishTransliterated = `${yiddishTransliterated}, ${b}`;
      if (yiddishHebrew) {
        const h = yivoToHebrew(b);
        if (h) yiddishHebrew = `${yiddishHebrew}, ${h}`;
      }
      enrichedLineIndex = i;
      enrichedLineReplacement = span.split(',')[0].trim();
      break;
    }

    if (span.trim() === 'participle' && b) {
      if (yiddishTransliterated) yiddishTransliterated = `${yiddishTransliterated}, ${b}`;
      if (yiddishHebrew) {
        const h = yivoToHebrew(b);
        if (h) yiddishHebrew = `${yiddishHebrew}, ${h}`;
      }
      enrichedLineIndex = i;
      enrichedLineReplacement = null;
      break;
    }

    if (span === 'plural') {
      // Full plural form (e.g. "hirher → hirhurem", "kapore → kapores").
      // Empty "()" appear where Hebrew spans were skipped — strip them.
      // weakmatch/goodmatch spans are now bare events, so the full YIVO
      // plural is already assembled in `b` (e.g. "kapore" + "s" = "kapores").
      const plural = b.replace(/\(\)/g, '').trim();
      if (plural && /[a-zA-Z]/.test(plural)) {
        if (yiddishTransliterated) yiddishTransliterated = `${yiddishTransliterated}, ${plural}`;
        // Use the Hebrew span text captured alongside this grammar line directly —
        // no conversion needed and avoids incorrect yivoToHebrew output for
        // loshn-koydesh words like כּפּרות.
        // When yiddishHebrew is null (plural-only entries like hoyries), set it
        // to the plural Hebrew form rather than appending.
        if (hebrew) {
          yiddishHebrew = yiddishHebrew ? `${yiddishHebrew}, ${hebrew}` : hebrew;
        }
        enrichedLineIndex = i;
        enrichedLineReplacement = null;
        break;
      }
    }
  }

  // Format grammar lines. The enriched line is replaced by enrichedLineReplacement
  // (null = drop, string = use as the formatted line).
  const formattedLines = grammarLines
    .map(({ span, bare }, i) =>
      i !== enrichedLineIndex ? formatGrammarLine(span, bare) : enrichedLineReplacement
    )
    .filter((l): l is string => l !== null && l !== '');

  const lines = [...formattedLines, ...sources].filter(Boolean);
  const grammaticalInfo = lines.length > 0 ? lines.join('\n') : null;
  const partOfSpeech = formattedLines.length > 0 ? formattedLines[0] : null;

  return {
    source: 'finkel',
    fromCache: false,
    yiddishTransliterated,
    yiddishHebrew,
    english,
    partOfSpeech,
    grammaticalInfo,
    isPhrase,
  };
}
