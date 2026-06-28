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

    if (!baseTransliterated && out.length > 0) {
      // Empty lexeme: a sub-sense of the preceding entry (e.g. same verb with a
      // different adverbial complement yielding a distinct meaning). Merge its
      // grammar + definition as an extra grammaticalInfo line on that entry.
      const extraLine = extractEmptyLexemeInfo(li.childNodes);
      if (extraLine) {
        const prev = out[out.length - 1];
        out[out.length - 1] = {
          ...prev,
          grammaticalInfo: prev.grammaticalInfo
            ? `${prev.grammaticalInfo}\n${extraLine}`
            : extraLine,
        };
      }
      const inlineUl = (li.childNodes as Node[]).find(
        n => (n as HTMLElement).tagName === 'UL'
      ) as HTMLElement | undefined;
      if (inlineUl) collectEntries(directLiChildren(inlineUl), isPhrase, out);
      continue;
    }

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

/**
 * For an empty-lexeme <li>, builds a compact summary line to merge into
 * the preceding entry's grammaticalInfo.
 * Format: GRAMMAR_LINE: english_definition
 */
function extractEmptyLexemeInfo(nodes: Node[]): string | null {
  const events = collectEvents(nodes);
  const { grammarLines, english } = processSegmentEvents(events);
  const grammarStr = grammarLines
    .map(({ span, bare }) => formatGrammarLine(span, bare))
    .filter(Boolean)
    .join(', ');
  if (!grammarStr && !english) return null;
  if (!english) return grammarStr;
  if (!grammarStr) return english;
  return `${grammarStr} — ${english}`;
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
  inlineAlts: Array<{ name: string; english: string }>;
} {
  const lastDefIdx = slice.reduce((last, ev, i) => (ev.kind === 'def' ? i : last), -1);
  const grammarLines: Array<{ span: string; bare: string; hebrew: string }> = [];
  let pendingSpan: string | null = null;
  let pendingBare = '';
  let pendingHebrew = '';
  let english: string | null = null;
  const sources: string[] = [];
  // Tracks a bare-text alt headword name seen after the main def is set.
  let pendingInlineAltName: string | null = null;
  const inlineAlts: Array<{ name: string; english: string }> = [];

  for (let i = 0; i < slice.length; i++) {
    const ev = slice[i];
    switch (ev.kind) {
      case 'grammar':
        if (pendingSpan !== null) grammarLines.push({ span: pendingSpan, bare: pendingBare, hebrew: pendingHebrew });
        pendingSpan = ev.text;
        pendingBare = '';
        pendingHebrew = '';
        // A new grammar context means any pending inline alt name (bare text
        // between defs) belongs to this new grammar, not to a headword variant.
        pendingInlineAltName = null;
        break;

      case 'def':
        if (pendingInlineAltName !== null) {
          // This def is the meaning of the pending inline alt headword.
          inlineAlts.push({ name: pendingInlineAltName, english: ev.text });
          pendingInlineAltName = null;
          if (pendingSpan !== null) {
            grammarLines.push({ span: pendingSpan, bare: pendingBare, hebrew: pendingHebrew });
            pendingSpan = null;
            pendingBare = '';
            pendingHebrew = '';
          }
        } else if (pendingSpan !== null && i < lastDefIdx) {
          // Potential secondary definition. Look ahead: if a non-empty bare word
          // appears before the next def, this def is the main entry's primary
          // meaning and the bare word is an inline alt headword (e.g. "kind →
          // child; kindenyu → dear child"). Otherwise it is a true secondary
          // sense description (e.g. "skeletal" under "adjectional form with -ish").
          let hasBareBetweenDefs = false;
          for (let k = i + 1; k < slice.length; k++) {
            const next = slice[k];
            if (next.kind === 'def') break;
            if (next.kind === 'bare' && next.text.trim().replace(/[,\s]+$/, '').trim()) {
              hasBareBetweenDefs = true;
              break;
            }
          }
          if (hasBareBetweenDefs) {
            // Close grammar context; treat this def as the primary English meaning.
            grammarLines.push({ span: pendingSpan, bare: pendingBare, hebrew: pendingHebrew });
            pendingSpan = null;
            pendingBare = '';
            pendingHebrew = '';
            if (english === null) english = ev.text || null;
          } else {
            // True secondary def: append text to current grammar line's bare.
            pendingBare += ev.text;
          }
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
        if (pendingSpan !== null) {
          pendingBare += ev.text;
        } else if (english !== null) {
          // Grammar context is closed and main def is already set — a non-empty
          // bare word here is the name of an inline alt headword.
          const altName = ev.text.trim().replace(/[,\s]+$/, '').trim();
          if (altName) pendingInlineAltName = altName;
        }
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

  return { grammarLines, english, sources, inlineAlts };
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

/**
 * Returns true if bare text following a grammar span looks like an alternative
 * headword rather than a grammar value.
 *
 * In Finkel HTML, alternative headwords always appear as bare text immediately
 * after a "gender X," span (gender m, gender f, gender n). Secondary definitions
 * (English words like "skeletal") appear after other span types. Restricting to
 * gender spans avoids misidentifying those as alt headwords.
 */
function isAltHeadwordBare(span: string, bare: string): boolean {
  const cleaned = bare.trim().replace(/[,\s]+$/, '').trim();
  if (!cleaned || !/^[a-zA-Z']/.test(cleaned)) return false;
  return span.trimStart().startsWith('gender ');
}

/**
 * Splits grammar lines into the main entry's lines and any alternative headwords
 * whose names appeared as bare text between grammar spans.
 *
 * For each alternative headword line at index i:
 *   - The span at i belongs to the preceding (main or prior alt) entry's grammar.
 *   - The bare at i is the alternative headword's name.
 *   - Grammar lines from i+1 up to the next alt index belong to that headword.
 */
function extractAltHeadwords(
  grammarLines: Array<{ span: string; bare: string; hebrew: string }>
): {
  mainLines: Array<{ span: string; bare: string; hebrew: string }>;
  altHeadwords: Array<{ name: string; grammarLines: Array<{ span: string; bare: string }> }>;
} {
  const altIndices = grammarLines.reduce<number[]>((acc, { span, bare }, i) =>
    isAltHeadwordBare(span, bare) ? [...acc, i] : acc, []);

  if (altIndices.length === 0) return { mainLines: grammarLines, altHeadwords: [] };

  const firstAltIdx = altIndices[0];
  const mainLines = grammarLines.slice(0, firstAltIdx + 1).map((line, i) =>
    i === firstAltIdx ? { ...line, bare: '' } : line
  );

  const altHeadwords = altIndices.map((altIdx, wi) => {
    const nextAltIdx = altIndices[wi + 1] ?? grammarLines.length;
    const name = grammarLines[altIdx].bare.trim().replace(/[,\s]+$/, '').trim();
    const lines: Array<{ span: string; bare: string }> = [];
    for (let j = altIdx + 1; j < nextAltIdx; j++) {
      lines.push({ span: grammarLines[j].span, bare: grammarLines[j].bare });
    }
    // The line at nextAltIdx (if another alt) contributes its span to this alt's grammar
    // and its bare as the next alt's name — include span-only here.
    if (nextAltIdx < grammarLines.length) {
      lines.push({ span: grammarLines[nextAltIdx].span, bare: '' });
    }
    return { name, grammarLines: lines };
  });

  return { mainLines, altHeadwords };
}

/** Format one alt headword with its compact grammar (no quotes). */
function formatAltHeadword(name: string, lines: Array<{ span: string; bare: string }>): string {
  const parts = lines
    .map(({ span, bare }) => {
      const cleanSpan = span.replace(/,\s*$/, '').trim();
      const cleanBare = bare.trim().replace(/[,\s]+$/, '').trim();
      return cleanBare ? `${cleanSpan} ${cleanBare}` : cleanSpan;
    })
    .filter(Boolean);
  return parts.length > 0 ? `${name}, ${parts.join(', ')}` : name;
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
  const { grammarLines, english, sources, inlineAlts } = processSegmentEvents(slice);
  const { mainLines, altHeadwords } = extractAltHeadwords(grammarLines);

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

  for (let i = 0; i < mainLines.length; i++) {
    const { span, bare, hebrew } = mainLines[i];
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
  const formattedLines = mainLines
    .map(({ span, bare }, i) =>
      i !== enrichedLineIndex ? formatGrammarLine(span, bare) : enrichedLineReplacement
    )
    .filter((l): l is string => l !== null && l !== '');

  // Alt headwords are joined with \r as the internal separator. \r is not a
  // \n so text.split('\n') in GrammarText keeps the entire "also:" block as
  // one Text element; GrammarText then substitutes \r → \n before rendering
  // so React Native shows each alt on its own visual line with no hairline
  // divider between them.
  const alsoLine = altHeadwords.length > 0
    ? `*also:* ${altHeadwords.map(ah => formatAltHeadword(ah.name, ah.grammarLines)).join(';\r')}`
    : null;

  // Inline alts come from def→bare→def patterns (e.g. "kind" → "child" / "kindenyu" → "dear child").
  // Format: *also:* name — definition (no grammar, since these forms have none in Finkel HTML).
  const inlineAltLine = inlineAlts.length > 0
    ? `*also:* ${inlineAlts.map(a => `${a.name} — ${a.english}`).join(';\r')}`
    : null;

  const lines = [
    ...formattedLines,
    ...(alsoLine ? [alsoLine] : []),
    ...(inlineAltLine ? [inlineAltLine] : []),
    ...sources,
  ].filter(Boolean);
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
