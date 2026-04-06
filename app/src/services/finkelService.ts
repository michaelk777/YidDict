import axios from 'axios';
import { parse, HTMLElement, Node } from 'node-html-parser';
import { stripNekudes } from '../utils/nekudes';

const FINKEL_URL =
  'https://www.cs.engr.uky.edu/~raphael/yiddish/dictionary.cgi';

export interface FinkelEntry {
  yiddishRomanized: string | null;
  yiddishHebrew: string | null;
  english: string | null;
  partOfSpeech: string | null;
  conjugationInfo: string | null;
  isPhrase: boolean;
  rawHtml: string;
}

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
): Promise<FinkelEntry[]> {
  const word = isHebrew ? stripNekudes(query) : query;

  // Stage 1: fragment match
  const stage1 = await postToFinkel({ word });
  if (stage1.length > 0) return stage1;

  // Stage 2: inflected-form → stem lookup
  return postToFinkel({ base: word });
}

async function postToFinkel(
  params: Record<string, string>
): Promise<FinkelEntry[]> {
  const body = new URLSearchParams(params).toString();
  const response = await axios.post<string>(FINKEL_URL, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return parseFinkelHtml(response.data);
}

// ---------------------------------------------------------------------------
// HTML parser
// ---------------------------------------------------------------------------

export function parseFinkelHtml(html: string): FinkelEntry[] {
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

  const entries: FinkelEntry[] = [];
  collectEntries(directLiChildren(resultUl), false, entries);
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

function collectEntries(
  lis: HTMLElement[],
  isPhrase: boolean,
  out: FinkelEntry[]
): void {
  for (const li of lis) {
    const lexemeSpan = directChildByClass(li, 'lexeme');

    if (!lexemeSpan) {
      // Phrase container: has a nested <ul> but no direct .lexeme child.
      // Its children are phrase/idiom sub-entries.
      const nestedUl = li.querySelector('ul');
      if (nestedUl) {
        collectEntries(directLiChildren(nestedUl), true, out);
      }
      continue;
    }

    // --- yiddishHebrew ---
    // The .hebrew span is a SIBLING of .lexeme (not nested inside it).
    // We want only the first one (base form); later .hebrew spans are plural
    // or other inflected forms.
    const hebrewSpan = directChildByClass(li, 'hebrew');
    const yiddishHebrew = hebrewSpan?.text.trim() || null;

    // --- yiddishRomanized ---
    // lexeme text ends with "(" when followed by a Hebrew span; strip it.
    const yiddishRomanized =
      lexemeSpan.text.replace(/\($/, '').trim() || null;

    // --- english ---
    const definitionSpan = li.querySelector('.definition');
    const english = definitionSpan?.text.trim() || null;

    // --- partOfSpeech / conjugationInfo ---
    const grammarSpans = li.querySelectorAll('.grammar');
    const partOfSpeech =
      grammarSpans.length > 0 ? grammarSpans[0].text.trim() || null : null;
    const conjugationInfo =
      grammarSpans.length > 1
        ? grammarSpans
            .slice(1)
            .map(s => s.text.trim())
            .filter(Boolean)
            .join('; ') || null
        : null;

    out.push({
      yiddishRomanized,
      yiddishHebrew,
      english,
      partOfSpeech,
      conjugationInfo,
      isPhrase,
      rawHtml: li.outerHTML,
    });

    // Some entries have their phrase sub-entries inside the SAME <li> (rare
    // but possible in deeply nested loshn-koydesh entries). Handle inline.
    const inlineNestedUl = (li.childNodes as Node[]).find(
      n => (n as HTMLElement).tagName === 'UL'
    ) as HTMLElement | undefined;
    if (inlineNestedUl) {
      collectEntries(directLiChildren(inlineNestedUl), true, out);
    }
  }
}
