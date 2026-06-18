import axios from 'axios';
import { parse } from 'node-html-parser';
import { ensureSession, isLoggedOut } from './verterbukh-auth';
import { getVbKeepLoggedIn } from '../db/settingsDb';
import { DictEntry } from '../types';

const BASE_URL = 'https://verterbukh.org/vb';

// Unicode bidi isolate marks (RLI/PDI). Wrapping a Hebrew phrase in these tells the
// bidi algorithm to skip it when picking the paragraph's base direction (UAX #9 P2),
// so a line starting with Yiddish text resolves to LTR base (matching its Latin
// continuation) instead of RTL — which would otherwise reverse the whole
// "{Yiddish} - {romanized} - {English}" segment order.
const RLI = '⁧';
const PDI = '⁩';

export interface VerterbukChoice {
  label: string;           // YIVO label (Yiddish→English) or Hebrew text (English→Yiddish)
  superscript?: string;    // Homograph number from <span class='sup'>, e.g. "1", "2"
  hebrewLemma: string;     // Hebrew lemma — ln= parameter value, e.g. "לױפֿן"
  dir: 'from' | 'to';     // Direction to use for the follow-up ln-pinned request
}

export interface VerterbukQuota {
  used: number;
  total: number;
}

export interface VerterbukResult {
  entries: DictEntry[];
  choices: VerterbukChoice[] | null; // null when no disambiguation needed
  quota: VerterbukQuota | null;      // null when quota-box not present in response
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Look up a word in Verterbukh.
 * Handles session expiry: if the response shows a logged-out page,
 * re-authenticates once and retries.
 *
 * @param query      YIVO romanization, Hebrew script, or English
 * @param ln         Optional Hebrew lemma — pins to a specific entry after the
 *                   user has chosen from disambiguation choices. Consumes a token.
 * @param forcedDir  Search direction. Defaults to 'from' (Yiddish→English). Pass
 *                   'to' for English→Yiddish. The caller is responsible for
 *                   retrying with 'to' when 'from' returns nothing and no choices.
 */
export async function lookupVerterbukh(
  query: string,
  ln?: string,
  forcedDir?: 'from' | 'to',
): Promise<VerterbukResult> {
  const primaryDir = forcedDir ?? 'from';
  const keepLoggedIn = await getVbKeepLoggedIn();
  const html = await fetchSearch(query, primaryDir, ln);

  if (isLoggedOut(html)) {
    // Session missing or expired — re-auth using stored credentials and retry once.
    // ensureSession throws if no credentials are saved, session expired, or the
    // user hasn't logged in during this app instance (keepLoggedIn=false gate).
    console.log('[YidDict] VerterbukService: not logged in — authenticating');
    await ensureSession(html, keepLoggedIn);
    const retryHtml = await fetchSearch(query, primaryDir, ln);
    if (isLoggedOut(retryHtml)) {
      throw new Error('Verterbukh authentication failed — check credentials in Settings');
    }
    return parseVerterbukhhHtml(retryHtml);
  }

  return parseVerterbukhhHtml(html);
}

async function fetchSearch(query: string, dir: 'from' | 'to', ln?: string): Promise<string> {
  const params: Record<string, string> = {
    yq: query,
    dir,
    tsu: 'en',
    trns: 't',    // request YIVO romanization alongside Hebrew headwords
    extend: '1',  // return all disambiguation choices without a "more" button
  };
  if (ln) params.ln = ln;

  const response = await axios.get(BASE_URL, { params });
  console.log(`[YidDict] VerterbukService: fetched results for "${query}" dir=${dir}${ln ? ` (ln=${ln})` : ''}`);
  return response.data as string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse Verterbukh response HTML into structured entries and disambiguation
 * choices. Exported for unit testing against saved HTML fixtures.
 */
export function parseVerterbukhhHtml(html: string): VerterbukResult {
  const root = parse(html);

  const entries: DictEntry[] = root.querySelectorAll('.def').map(parseDef);

  // Choices — two HTML structures depending on search direction:
  //   dir=from (Yiddish→English): .choice_box .option a[href*="ln="] with YIVO labels
  //   dir=to   (English→Yiddish): <select class="rev-choices"> with Hebrew <option> text
  let choices: VerterbukChoice[] | null = null;

  const choiceBoxNodes = root.querySelectorAll('.choice_box .option');
  if (choiceBoxNodes.length > 0) {
    const parsed = choiceBoxNodes.map(node => {
      const anchor = node.querySelector('a');
      const href = anchor?.getAttribute('href') ?? '';
      const lnMatch = href.match(/[?&]ln=([^&]+)/);
      const supNode = anchor?.querySelector('.sup');
      const superscript = supNode?.text.trim() || undefined;
      const label = anchor
        ? anchor.text.replace(supNode?.text ?? '', '').trim()
        : '';
      return {
        label,
        superscript,
        hebrewLemma: lnMatch ? decodeURIComponent(lnMatch[1]) : '',
        dir: 'from' as const,
      };
    }).filter(c => c.label && c.hebrewLemma);
    if (parsed.length > 0) choices = parsed;
  } else {
    const selectNode = root.querySelector('select.rev-choices');
    if (selectNode) {
      const parsed = selectNode.querySelectorAll('option').map(opt => {
        const text = opt.text.trim().replace(/ /g, '');
        return { label: text, hebrewLemma: text, dir: 'to' as const };
      }).filter(c => c.hebrewLemma.length > 0);
      if (parsed.length > 0) choices = parsed;
    }
  }

  // Quota — parse "used X/Y" from .quota-box (present when logged in)
  let quota: VerterbukQuota | null = null;
  const quotaBox = root.querySelector('.quota-box');
  if (quotaBox) {
    const match = quotaBox.text.match(/used\s+(\d+)\/(\d+)/i);
    if (match) {
      quota = { used: parseInt(match[1], 10), total: parseInt(match[2], 10) };
      console.log(`[YidDict] VerterbukService: quota ${quota.used}/${quota.total}`);
    }
  }

  return { entries, choices, quota };
}

// ---------------------------------------------------------------------------
// Definition parsing — segment-based state machine
//
// A `.def` block is a flat sequence of child divs: lemma, [headword translit],
// then repeating groups of either
//   (grammar .rtl, grammar .translit, .gloss)  — a "definition" (POS + meaning), or
//   (.rtl.sep, .translit, .gloss)              — a phrase (usage example, set
//                                                 expression, variation, etc. —
//                                                 anything under a .sep wrapper)
// The first definition supplies english/partOfSpeech and headword enrichment
// (past participle, plural suffix); everything else folds into grammaticalInfo
// as additional lines, mirroring how Finkel collapses secondary definitions
// into one block.
// ---------------------------------------------------------------------------

interface DefinitionSegment {
  kind: 'definition';
  grammarYiddish: ReturnType<typeof parse> | null;
  grammarRomanized: ReturnType<typeof parse> | null;
  gloss: string;
}

interface PhraseSegment {
  kind: 'phrase';
  yiddishPhrase: string;
  romanizedPhrase: string | null;
  englishPhrase: string;
}

type DefSegment = DefinitionSegment | PhraseSegment;

/** Concatenate a node's text, skipping nested `.help` spans (tooltip text baked into the DOM). */
function textExcludingHelp(node: ReturnType<typeof parse>): string {
  let result = '';
  for (const child of node.childNodes) {
    if (!('classList' in child)) {
      result += (child as unknown as { text: string }).text;
      continue;
    }
    const el = child as ReturnType<typeof parse>;
    if (el.classList?.contains('help')) continue;
    result += el.childNodes.length > 0 ? textExcludingHelp(el) : el.text;
  }
  return result;
}

/** Strip surrounding whitespace/parentheses left from a `.glossed` span's wrapper, e.g. "(ן)" -> "ן". */
function unwrapForm(text: string): string {
  return text.replace(/^[\s()]+|[\s()]+$/g, '').trim();
}

/** Find the first `.glossed` span whose `.help` label matches, returning its cleaned form text. */
function formByLabel(node: ReturnType<typeof parse> | null, targetLabel: string): string | null {
  if (!node) return null;
  for (const glossed of node.querySelectorAll('.glossed')) {
    const helpNode = glossed.querySelector('.help');
    if (helpNode?.text.trim() === targetLabel) {
      const form = unwrapForm(textExcludingHelp(glossed));
      if (form) return form;
    }
  }
  return null;
}

/**
 * Render a grammar block's terse summary straight from Verterbukh's own romanized
 * text — preserves its abbreviations and "/" alternatives ("n. masc./neut.",
 * "adj./adv. comp. ShENER") without us inventing any abbreviation scheme. Spans
 * whose `.help` label is in `skipLabels` are omitted — used to remove forms that
 * have been folded into the headword instead (e.g. plural suffix, participle).
 */
function grammarSummaryLine(node: ReturnType<typeof parse> | null, skipLabels: Set<string>): string | null {
  if (!node) return null;
  let result = '';
  for (const child of node.childNodes) {
    if (!('classList' in child)) {
      result += (child as unknown as { text: string }).text;
      continue;
    }
    const el = child as ReturnType<typeof parse>;
    if (el.classList?.contains('help')) continue;
    if (el.classList?.contains('glossed')) {
      const helpNode = el.querySelector('.help');
      const label = helpNode?.text.trim() ?? '';
      if (skipLabels.has(label)) continue;
      result += textExcludingHelp(el);
    } else {
      result += el.text;
    }
  }
  const cleaned = result.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

/**
 * Render a phrase node's text, marking any inline grammar annotation Verterbukh
 * bakes directly into the phrase itself (e.g. a `.gram` span reading "DAT"/"דאַט" for
 * a dative usage, which may appear at the start, middle, or end of the phrase) with
 * `*...*` — "...בײַ/פֿון *דאַט* דעם..." / "...BAY/FUN *DAT* DEM..." — so the UI can
 * render it distinctly from the phrase's own wording.
 */
function formatPhraseText(node: ReturnType<typeof parse>): string {
  let result = '';
  for (const child of node.childNodes) {
    if (!('classList' in child)) {
      result += (child as unknown as { text: string }).text;
      continue;
    }
    const el = child as ReturnType<typeof parse>;
    if (el.classList?.contains('help')) continue;
    if (el.classList?.contains('gram')) {
      const annotation = textExcludingHelp(el).trim();
      if (annotation) result += `*${annotation}*`;
      continue;
    }
    result += el.childNodes.length > 0 ? formatPhraseText(el) : el.text;
  }
  return result.trim();
}

/** Group a `.def` block's child divs into headword info + ordered definition/phrase segments. */
function collectDefSegments(defNode: ReturnType<typeof parse>): {
  baseHebrew: string | null;
  baseRomanized: string | null;
  segments: DefSegment[];
} {
  const children = defNode.childNodes.filter(
    (n): n is ReturnType<typeof parse> => 'classList' in n
  );

  let baseHebrew: string | null = null;
  let baseRomanized: string | null = null;
  const segments: DefSegment[] = [];
  let i = 0;

  if (i < children.length) {
    const lemmaNode = children[i].querySelector('.lemma');
    if (lemmaNode) {
      baseHebrew = lemmaNode.text.replace(/\|/g, '').trim() || null;
      i++;
    }
  }
  if (i < children.length && children[i].classList?.contains('translit') && !children[i].querySelector('.glossed')) {
    baseRomanized = children[i].text.replace(/\|/g, '').trim() || null;
    i++;
  }

  while (i < children.length) {
    const node = children[i];

    if (node.classList?.contains('sep')) {
      // formatPhraseText (not .text) — phrases sometimes bake an inline grammar
      // annotation into their own Hebrew/romanized spans (e.g. "שײַנען דאַט" /
      // "ShAYNEN DAT" for a dative usage); it both excludes the hidden .help
      // tooltip text ("dative") and sets the annotation off in parentheses.
      const yiddishPhrase = formatPhraseText(node);
      i++;
      let romanizedPhrase: string | null = null;
      if (i < children.length && children[i].classList?.contains('translit')) {
        romanizedPhrase = formatPhraseText(children[i]) || null;
        i++;
      }
      let englishPhrase = '';
      if (i < children.length && children[i].classList?.contains('gloss')) {
        englishPhrase = children[i].text.trim();
        i++;
      }
      segments.push({ kind: 'phrase', yiddishPhrase, romanizedPhrase, englishPhrase });
      continue;
    }

    if (node.classList?.contains('rtl') && node.querySelector('.glossed')) {
      const grammarYiddish = node;
      i++;
      let grammarRomanized: ReturnType<typeof parse> | null = null;
      if (i < children.length && children[i].classList?.contains('translit')) {
        grammarRomanized = children[i];
        i++;
      }
      let gloss = '';
      if (i < children.length && children[i].classList?.contains('gloss')) {
        gloss = children[i].text.trim();
        i++;
      }
      segments.push({ kind: 'definition', grammarYiddish, grammarRomanized, gloss });
      continue;
    }

    if (node.classList?.contains('gloss')) {
      segments.push({ kind: 'definition', grammarYiddish: null, grammarRomanized: null, gloss: node.text.trim() });
      i++;
      continue;
    }

    i++; // skip anything unrecognized (e.g. stray whitespace-only nodes)
  }

  return { baseHebrew, baseRomanized, segments };
}

function parseDef(defNode: ReturnType<typeof parse>): DictEntry {
  const { baseHebrew, baseRomanized, segments } = collectDefSegments(defNode);

  let yiddishHebrew = baseHebrew;
  let yiddishRomanized = baseRomanized;
  let partOfSpeech: string | null = null;
  let english: string | null = null;
  const grammarLines: string[] = [];

  for (const seg of segments) {
    if (seg.kind === 'definition') {
      const skipLabels = new Set<string>();

      // Headword enrichment — verb past participle (with auxiliary) folds in as
      // "word, participle"; noun plural suffix folds in as "word, -suffix",
      // matching Finkel's "word, gelofn" / "word, -n" conventions. Adjective
      // comparatives/stems are deliberately NOT folded in — they stay below.
      const participleHebrew = formByLabel(seg.grammarYiddish, 'past participle');
      const participleRom = formByLabel(seg.grammarRomanized, 'past participle');
      if (participleHebrew) {
        yiddishHebrew = yiddishHebrew ? `${yiddishHebrew}, ${participleHebrew}` : participleHebrew;
        if (participleRom) {
          yiddishRomanized = yiddishRomanized ? `${yiddishRomanized}, ${participleRom}` : participleRom;
        }
        skipLabels.add('past participle');
      }

      const pluralHebrew = formByLabel(seg.grammarYiddish, 'plural');
      const pluralRom = formByLabel(seg.grammarRomanized, 'plural');
      if (pluralHebrew) {
        yiddishHebrew = yiddishHebrew ? `${yiddishHebrew}, -${pluralHebrew}` : `-${pluralHebrew}`;
        if (pluralRom) {
          yiddishRomanized = yiddishRomanized ? `${yiddishRomanized}, -${pluralRom}` : `-${pluralRom}`;
        }
        skipLabels.add('plural');
      }

      const summary = grammarSummaryLine(seg.grammarRomanized, skipLabels);

      if (english === null) {
        english = seg.gloss || null;
        partOfSpeech = summary;
        if (summary) grammarLines.push(summary);
      } else if (seg.gloss) {
        // Secondary definition — same headword, different POS/meaning — folds
        // into the grammar block as "{POS} - {gloss}" rather than a child entry
        // (which would create a duplicate cache row / bookmark for one headword),
        // mirroring how Finkel folds secondary definitions into a grammar line.
        grammarLines.push(summary ? `${summary} - ${seg.gloss}` : seg.gloss);
      }
    } else {
      // Phrase (usage example, set expression, variation, etc.) — rendered as
      // exactly what Verterbukh writes for it, with no POS label borrowed from
      // a prior definition (a phrase's part of speech isn't necessarily the
      // same as the definition it follows), e.g.
      // "אַװעקלױפֿן צו - AVEKLOYFN TSU - run/hurry to"
      const parts = [
        seg.yiddishPhrase ? `${RLI}${seg.yiddishPhrase}${PDI}` : null,
        seg.romanizedPhrase,
        seg.englishPhrase,
      ].filter((p): p is string => !!p);
      if (parts.length > 0) grammarLines.push(parts.join(' - '));
    }
  }

  const grammaticalInfo = grammarLines.length > 0 ? grammarLines.join('\n') : null;

  return {
    source: 'verterbukh',
    fromCache: false,
    yiddishHebrew,
    yiddishRomanized,
    partOfSpeech,
    grammaticalInfo,
    english,
    isPhrase: false,
  };
}
