import axios from 'axios';
import { parse, HTMLElement, Node } from 'node-html-parser';
import { stripNekudes } from '../utils/nekudes';
import { yivoToHebrew } from '../utils/yivoToHebrew';
import { DictEntry } from '../types';
import { log } from '../utils/logger';

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
  log(`[YidDict] finkelService: lookupFinkel query="${word}" isHebrew=${isHebrew}`);

  // Stage 1: fragment match
  log('[YidDict] finkelService: stage 1 — POST word=<query>');
  const stage1 = await postToFinkel({ word });
  log(`[YidDict] finkelService: stage 1 returned ${stage1.length} result(s)`);
  if (stage1.length > 0) return stage1;

  // Stage 2: inflected-form → stem lookup
  log('[YidDict] finkelService: stage 1 empty, falling back to stage 2 — POST base=<query>');
  const stage2 = await postToFinkel({ base: word });
  log(`[YidDict] finkelService: stage 2 returned ${stage2.length} result(s)`);
  return stage2;
}

async function postToFinkel(
  params: Record<string, string>
): Promise<DictEntry[]> {
  log(`[YidDict] finkelService: POST to Finkel params=${JSON.stringify(params)}`);
  const body = new URLSearchParams(params).toString();
  const response = await axios.post<string>(FINKEL_URL, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  log('[YidDict] finkelService: Finkel responded, parsing HTML');
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
  log(`[YidDict] finkelService: parseFinkelHtml found ${entries.length} entr(ies)`);
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

/**
 * Walks the sequence of word(+Hebrew) pairs that can appear directly after
 * the base Hebrew span, before the first grammar span or definition. A word
 * followed by its own Hebrew span is fully covered and merges into both
 * yiddishTransliterated and yiddishHebrew; a word with no Hebrew span merges
 * into yiddishTransliterated only, which is what makes the result partial.
 *
 * Stops the moment a grammar span appears, leaving everything from there on
 * for extractAltHeadwords — that's the mechanism for headwords that get
 * their own full grammar description, not this one.
 */
function collectHeadwordContinuation(li: HTMLElement): {
  transliteratedSuffix: string;
  hebrewSuffix: string;
  isPartial: boolean;
} {
  let transliteratedSuffix = '';
  let hebrewSuffix = '';
  let isPartial = false;
  let sawBaseHebrew = false;
  // A word ending in an unclosed "(" — waiting to see if a Hebrew span
  // follows it before it's committed to transliteratedSuffix.
  let pendingWord: string | null = null;

  for (const child of li.childNodes) {
    const el = child as HTMLElement;

    if (el.tagName) {
      if (el.classList?.contains('lexeme')) continue;

      if (el.classList?.contains('hebrew')) {
        if (!sawBaseHebrew) {
          sawBaseHebrew = true;
          continue;
        }
        if (pendingWord !== null) {
          transliteratedSuffix += pendingWord;
          hebrewSuffix += ` ${el.text.trim()}`;
          pendingWord = null;
          continue;
        }
        break;
      }

      // Any other tag (grammar, definition, source, etc.) ends the window.
      break;
    }

    if (!sawBaseHebrew) continue;
    const afterParen = (child.text ?? '').replace(/^\)/, '');
    const cleaned = afterParen.trim();
    if (!cleaned) continue;

    if (cleaned.endsWith('(')) {
      // A new word that's about to get its own Hebrew span.
      const word = cleaned.slice(0, -1);
      pendingWord = /^\s/.test(afterParen) ? ` ${word}` : word;
      continue;
    }

    // Plain continuation text with no Hebrew of its own — hyphen-prefixed
    // fuses directly ("-erdish"); anything else needs a space to join.
    const needsSpace = /^\s/.test(afterParen) && !cleaned.startsWith('-');
    transliteratedSuffix += needsSpace ? ` ${cleaned}` : cleaned;
    isPartial = true;
    break;
  }

  return { transliteratedSuffix, hebrewSuffix, isPartial };
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

    // Words (and their Hebrew, if any) that continue directly after the base
    // Hebrew span, before any grammar starts — see collectHeadwordContinuation.
    const continuation = collectHeadwordContinuation(li);
    const fullTransliterated = continuation.transliteratedSuffix
      ? `${baseTransliterated ?? ''}${continuation.transliteratedSuffix}`
      : baseTransliterated;
    const fullHebrew = continuation.hebrewSuffix
      ? `${baseHebrew ?? ''}${continuation.hebrewSuffix}`
      : baseHebrew;

    // The Hebrew span, when present, only ever covers the one word of
    // baseTransliterated directly before it (plus whatever collectHeadword-
    // Continuation merged in above). If the full headword turns out to have
    // more words than that — a multi-word baseTransliterated on its own, or
    // uncovered continuation text — the rest will have no matching Hebrew.
    // hebrewCoveredWord records exactly which word, so the app can later
    // splice generated Hebrew in around it instead of discarding it.
    const isPartial =
      baseHebrew !== null &&
      (continuation.isPartial || (baseTransliterated?.trim().split(/\s+/).length ?? 1) > 1);
    const hebrewCoveredWord = isPartial ? baseTransliterated?.trim().split(/\s+/).pop() ?? null : null;

    out.push(...parseEntryChildren(li.childNodes, fullTransliterated, fullHebrew, isPhrase, hebrewCoveredWord));

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
        const trimmed = ev.text.trim();
        // Hyphen-prefixed bare text (e.g. "-ish", "-en") is a grammatical
        // suffix value, not a new headword — real headwords never start with
        // a hyphen. Without this check, a suffix like "-ish" gets misread as
        // a word-like token and triggers a false entry split.
        if (/[a-zA-Zא-תיִ-פֿ]/.test(trimmed) && !trimmed.startsWith('-')) wordIdx = j;
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
interface GrammarLine {
  span: string;
  bare: string;
  hebrew: string;
  secondaryDef: string | null;
  closedByGrammar: boolean;
}

function processSegmentEvents(slice: Ev[]): {
  grammarLines: GrammarLine[];
  english: string | null;
  sources: string[];
  inlineAlts: Array<{ name: string; english: string }>;
  postDefAltName: string;
  postDefAltHebrew: string;
  postDefAltGrammar: string | null;
} {
  const lastDefIdx = slice.reduce((last, ev, i) => (ev.kind === 'def' ? i : last), -1);
  const grammarLines: GrammarLine[] = [];
  let pendingSpan: string | null = null;
  let pendingBare = '';
  let pendingHebrew = '';
  let pendingSecondaryDef: string | null = null;
  let english: string | null = null;
  const sources: string[] = [];
  // Raw bare text accumulating into a candidate name after the main def is
  // set (e.g. "mi" + "khuts" + "(" while building up "mikhuts").
  let pendingPostDefWord = '';
  const inlineAlts: Array<{ name: string; english: string }> = [];
  // Word(+Hebrew) pairs appearing after the main def, with no definition of
  // their own — merged into one alt entry (see collectHeadwordContinuation
  // for the analogous pre-definition case; same reasoning applies here:
  // there's no reliable signal to split multiple such pairs into separate
  // alt headwords, e.g. "mikhuts(מחוץ) akhuts(אַחוץ)").
  let postDefAltName = '';
  let postDefAltHebrew = '';
  let postDefAltGrammar: string | null = null;

  const pushPending = (closedByGrammar: boolean) => {
    if (pendingSpan === null) return;
    grammarLines.push({
      span: pendingSpan,
      bare: pendingBare,
      hebrew: pendingHebrew,
      secondaryDef: pendingSecondaryDef,
      closedByGrammar,
    });
    pendingSpan = null;
    pendingBare = '';
    pendingHebrew = '';
    pendingSecondaryDef = null;
  };

  for (let i = 0; i < slice.length; i++) {
    const ev = slice[i];
    switch (ev.kind) {
      case 'grammar':
        if (pendingSpan === null && english !== null && postDefAltName) {
          // Shared trailing grammar for the post-definition alt name(s)
          // accumulated above (e.g. "preposition" describing "mikhuts akhuts").
          postDefAltGrammar = ev.text;
          break;
        }
        pushPending(true);
        pendingSpan = ev.text;
        pendingBare = '';
        pendingHebrew = '';
        pendingSecondaryDef = null;
        // A new grammar context means any pending post-def word (bare text
        // between defs) belongs to this new grammar, not to a headword variant.
        pendingPostDefWord = '';
        break;

      case 'def': {
        const pendingPostDefName = pendingPostDefWord.trim().replace(/[,\s]+$/, '').trim();
        if (pendingPostDefName) {
          // This def is the meaning of the pending inline alt headword.
          inlineAlts.push({ name: pendingPostDefName, english: ev.text });
          pendingPostDefWord = '';
          pushPending(false);
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
            pushPending(false);
            if (english === null) english = ev.text || null;
          } else {
            // True secondary def: append text to current grammar line's bare.
            pendingBare += ev.text;
          }
        } else if (
          pendingSpan !== null &&
          english !== null &&
          pendingSpan.trim().startsWith('adjectival form with')
        ) {
          // Trailing "adjectival form with" def is a secondary meaning for
          // that derived form (e.g. "erd" → "earth", then "-en" → "earthy"),
          // not a new primary meaning. Scoped narrowly here since other
          // trigger spans (plural, plural in, participle) have their own
          // headword-enrichment handling that a trailing def would corrupt.
          // Kept as its own field (not merged into pendingBare) so it renders
          // outside the quoted suffix, e.g. adjectival form with "-en", earthy.
          pendingSecondaryDef = pendingSecondaryDef ? `${pendingSecondaryDef}; ${ev.text}` : ev.text;
        } else {
          pushPending(false);
          if (english === null) english = ev.text || null;
        }
        break;
      }

      case 'bare':
        if (pendingSpan !== null) {
          pendingBare += ev.text;
        } else if (english !== null) {
          // Grammar context is closed and main def is already set — accumulate
          // raw bare text into the pending post-def word (e.g. "mi" + "khuts").
          pendingPostDefWord += ev.text;
        }
        break;

      case 'hebrew':
        // Captured for any pending grammar context, not just "plural" — a
        // Hebrew span can also belong to an alt headword's own name (see
        // extractAltHeadwords), not only to the primary entry's plural-form
        // enrichment.
        if (pendingSpan !== null) {
          pendingHebrew += ev.text;
        } else if (english !== null && pendingPostDefWord.trim()) {
          const word = pendingPostDefWord.replace(/\($/, '').trim().replace(/^[),\s]+/, '').trim();
          if (word) {
            postDefAltName = postDefAltName ? `${postDefAltName} ${word}` : word;
            const hebrewText = ev.text.trim();
            postDefAltHebrew = postDefAltHebrew ? `${postDefAltHebrew} ${hebrewText}` : hebrewText;
          }
          pendingPostDefWord = '';
        }
        break;

      case 'source':
        sources.push(ev.text);
        break;

      default:
        break;
    }
  }
  pushPending(false);

  return { grammarLines, english, sources, inlineAlts, postDefAltName, postDefAltHebrew, postDefAltGrammar };
}

/**
 * Format one grammar line from its span text and accumulated bare text.
 *
 * When bare content is present, the span's trailing comma acts as a natural
 * separator (e.g. "adjectival form with '-ish', skeletal"), so it is kept.
 * When bare content is empty, the trailing comma is spurious and stripped
 * (e.g. "gender f," → "gender f").
 *
 * secondaryDef, when present, is a trailing meaning that renders after the
 * quoted bare value with the same " — " separator used for adverbial
 * complements (e.g. adjectival form with "-en" — earthy).
 */
function formatGrammarLine(span: string, bare: string, secondaryDef: string | null = null): string {
  const cleaned = bare.trim().replace(/,\s*$/, '').trim();
  const base = cleaned ? `${span} "${cleaned}"` : span.replace(/,\s*$/, '').trim();
  return secondaryDef ? `${base} — ${secondaryDef}` : base;
}

/** Strip trailing comma and whitespace from bare text. */
function cleanBare(s: string): string {
  return s.trim().replace(/,\s*$/, '').trim();
}

/**
 * Bolds and capitalizes a literal "source:" prefix in a Finkel .source span
 * (e.g. "source: Sholem Aleykhem" → "*Source:* Sholem Aleykhem"), matching
 * the *Also:* convention. Other .source content (e.g. "indeclinable") isn't
 * a citation and is left as plain text.
 */
function formatSourceLine(s: string): string {
  return s.replace(/^source:\s*/i, '*Source:* ');
}

/**
 * Tries to pull a new alt-headword name out of a grammar line's bare text.
 * Two shapes show up in real Finkel data:
 *
 *   - Mixed: suffix + comma + word, e.g. "-dik, mekutsefte(" → kept "-dik,",
 *     name "mekutsefte". The leading hyphen is what makes this safe — the
 *     "plural"/"participle" triggers never produce hyphen-prefixed bare text,
 *     so this can't collide with them.
 *   - Pure: bare text is just one word, e.g. "o'ngelaf" or "khu'tspenitse()"
 *     (empty parens = where a Hebrew span got pulled out separately).
 *     Excluded when the span is exactly "plural" or "participle", since
 *     those consume a bare word as their own enrichment value, not a name.
 *
 * Either way, the caller only trusts the result if the line was also
 * closedByGrammar (a fresh grammar event followed, not a definition) — that's
 * what rules out e.g. "gradable adjective with stem" → "shen" → "pretty",
 * where "shen" matches the pure shape but is just a stem value.
 */
function splitAltHeadwordCandidate(
  span: string,
  bare: string
): { keptBare: string; candidateName: string | null } {
  const mixedMatch = bare.match(/^(\s*-[^,]*,)\s*([a-zA-Z'][a-zA-Z']*)\(?\)?\s*,?\s*$/);
  if (mixedMatch) return { keptBare: mixedMatch[1], candidateName: mixedMatch[2] };

  const pureMatch = bare.match(/^\s*([a-zA-Z'][a-zA-Z']*)\(?\)?\s*,?\s*$/);
  const trimmedSpan = span.trim();
  if (pureMatch && trimmedSpan !== 'plural' && trimmedSpan !== 'participle') {
    return { keptBare: '', candidateName: pureMatch[1] };
  }

  return { keptBare: bare, candidateName: null };
}

/**
 * Splits grammar lines into the main entry's lines and any alt headwords
 * whose names turned up as bare text between grammar spans (name at index i
 * belongs to grammar line i's span; lines i+1 up to the next alt belong to
 * that headword).
 */
function extractAltHeadwords(
  grammarLines: GrammarLine[]
): {
  mainLines: GrammarLine[];
  altHeadwords: Array<{ name: string; hebrew: string; grammarLines: Array<{ span: string; bare: string }> }>;
} {
  const splits = grammarLines.map(line =>
    line.closedByGrammar
      ? splitAltHeadwordCandidate(line.span, line.bare)
      : { keptBare: line.bare, candidateName: null as string | null }
  );

  const altIndices = splits.reduce<number[]>(
    (acc, s, i) => (s.candidateName !== null ? [...acc, i] : acc), []
  );

  if (altIndices.length === 0) return { mainLines: grammarLines, altHeadwords: [] };

  const firstAltIdx = altIndices[0];
  const mainLines = grammarLines.slice(0, firstAltIdx + 1).map((line, i) =>
    i === firstAltIdx ? { ...line, bare: splits[i].keptBare, hebrew: '' } : line
  );

  const altHeadwords = altIndices.map((altIdx, wi) => {
    const nextAltIdx = altIndices[wi + 1] ?? grammarLines.length;
    let name = splits[altIdx].candidateName!;
    let hebrew = grammarLines[altIdx].hebrew;
    const lines: Array<{ span: string; bare: string }> = [];
    let enriched = false;

    // Mirror buildEntryFromSegment's headword enrichment (plural-in suffix,
    // participle, full plural form) for the alt headword's own grammar
    // lines, same as a primary entry gets — only the first matching line is
    // folded in, the rest render as normal grammar text.
    const addOwnLine = (j: number) => {
      const line = grammarLines[j];
      const bare = splits[j].keptBare;
      const span = line.span;
      const b = cleanBare(bare);

      if (!enriched && span.includes('plural in') && b.startsWith('-')) {
        name = `${name}, ${b}`;
        if (hebrew) {
          const h = yivoToHebrew(b);
          if (h) hebrew = `${hebrew}, ${h}`;
        }
        enriched = true;
        lines.push({ span: span.split(',')[0].trim(), bare: '' });
        return;
      }

      if (!enriched && span.trim() === 'participle' && b) {
        name = `${name}, ${b}`;
        if (hebrew) {
          const h = yivoToHebrew(b);
          if (h) hebrew = `${hebrew}, ${h}`;
        }
        enriched = true;
        return;
      }

      if (!enriched && span.trim() === 'plural') {
        const plural = b.replace(/\(\)/g, '').trim();
        if (plural && /[a-zA-Z]/.test(plural)) {
          name = `${name}, ${plural}`;
          if (line.hebrew) hebrew = hebrew ? `${hebrew}, ${line.hebrew}` : line.hebrew;
          enriched = true;
          return;
        }
      }

      lines.push({ span, bare });
    };

    for (let j = altIdx + 1; j < nextAltIdx; j++) addOwnLine(j);
    // The next alt's own line still contributes its span to this alt's grammar.
    if (nextAltIdx < grammarLines.length) addOwnLine(nextAltIdx);

    return { name, hebrew, grammarLines: lines };
  });

  return { mainLines, altHeadwords };
}

/** Format one alt headword with its name, optional Hebrew, and compact grammar. */
function formatAltHeadword(name: string, hebrew: string, lines: Array<{ span: string; bare: string }>): string {
  const parts = lines
    .map(({ span, bare }) => {
      const cleanSpan = span.replace(/,\s*$/, '').trim();
      const cleanBare = bare.trim().replace(/[,\s]+$/, '').trim();
      return cleanBare ? `${cleanSpan} ${cleanBare}` : cleanSpan;
    })
    .filter(Boolean);
  const label = hebrew ? `${name} (${hebrew})` : name;
  return parts.length > 0 ? `${label}, ${parts.join(', ')}` : label;
}

function parseEntryChildren(
  nodes: Node[],
  baseTransliterated: string | null,
  baseHebrew: string | null,
  isPhrase: boolean,
  hebrewCoveredWord: string | null = null
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

  // hebrewCoveredWord describes the relationship between baseTransliterated
  // and baseHebrew specifically — only meaningful for the first segment,
  // which is the one that actually inherited them.
  return segments.map((seg, i) =>
    buildEntryFromSegment(seg.lexeme, seg.hebrew, seg.slice, isPhrase, i === 0 ? hebrewCoveredWord : null)
  );
}

function buildEntryFromSegment(
  lexeme: string | null,
  hebrew: string | null,
  slice: Ev[],
  isPhrase: boolean,
  hebrewCoveredWord: string | null = null
): DictEntry {
  const { grammarLines, english, sources, inlineAlts, postDefAltName, postDefAltHebrew, postDefAltGrammar } =
    processSegmentEvents(slice);
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
    .map(({ span, bare, secondaryDef }, i) =>
      i !== enrichedLineIndex ? formatGrammarLine(span, bare, secondaryDef) : enrichedLineReplacement
    )
    .filter((l): l is string => l !== null && l !== '');

  // Alt headwords are joined with \r as the internal separator. \r is not a
  // \n so text.split('\n') in GrammarText keeps the entire "also:" block as
  // one Text element; GrammarText then substitutes \r → \n before rendering
  // so React Native shows each alt on its own visual line with no hairline
  // divider between them.
  const alsoLine = altHeadwords.length > 0
    ? `*Also:* ${altHeadwords.map(ah => formatAltHeadword(ah.name, ah.hebrew, ah.grammarLines)).join(';\r')}`
    : null;

  // Inline alts come from def→bare→def patterns (e.g. "kind" → "child" / "kindenyu" → "dear child").
  // Format: *Also:* name — definition (no grammar, since these forms have none in Finkel HTML).
  const inlineAltLine = inlineAlts.length > 0
    ? `*Also:* ${inlineAlts.map(a => `${a.name} — ${a.english}`).join(';\r')}`
    : null;

  // Word(+Hebrew) pairs appearing after the main definition with no
  // definition of their own (e.g. "mikhuts(מחוץ) akhuts(אַחוץ)" under
  // "khuts" — merged into one alt entry; see processSegmentEvents).
  const postDefAltLine = postDefAltName
    ? `*Also:* ${postDefAltHebrew ? `${postDefAltName} (${postDefAltHebrew})` : postDefAltName}${postDefAltGrammar ? `, ${postDefAltGrammar}` : ''}`
    : null;

  const lines = [
    ...formattedLines,
    ...(alsoLine ? [alsoLine] : []),
    ...(inlineAltLine ? [inlineAltLine] : []),
    ...(postDefAltLine ? [postDefAltLine] : []),
    ...sources.map(formatSourceLine),
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
    ...(hebrewCoveredWord ? { hebrewIsPartial: true, hebrewCoveredWord } : {}),
  };
}
