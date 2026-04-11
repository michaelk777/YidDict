import axios from 'axios';
import { parse } from 'node-html-parser';
import { ensureSession, isLoggedOut } from './verterbukh-auth';

const BASE_URL = 'https://verterbukh.org/vb';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerterbukEntry {
  yiddishHebrew: string | null;
  yiddishRomanized: string | null;   // YIVO romanization — first .translit div; present when trns=t is sent
  partOfSpeech: string | null;       // e.g. "verb", "neuter noun"
  grammaticalInfo: string | null;    // e.g. "past participle: איז געלאָפֿן", "plural: עך"
  english: string | null;            // main definition (with domain labels preserved)
  exampleYiddish: string | null;     // .sep example phrase
  exampleEnglish: string | null;     // .gloss translation of the example
}

export interface VerterbukChoice {
  label: string;        // YIVO label shown to user, e.g. "LOYFN"
  hebrewLemma: string;  // ln= parameter value, e.g. "לױפֿן"
}

export interface VerterbukQuota {
  used: number;
  total: number;
}

export interface VerterbukResult {
  entries: VerterbukEntry[];
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
 * @param query  YIVO romanization or Hebrew script
 * @param ln     Optional Hebrew lemma — pins to a specific entry after the
 *               user has chosen from disambiguation choices. Consumes a token.
 */
export async function lookupVerterbukh(
  query: string,
  ln?: string,
): Promise<VerterbukResult> {
  const html = await fetchSearch(query, ln);

  if (isLoggedOut(html)) {
    // Session missing or expired — re-auth using stored credentials and retry once.
    // ensureSession throws if no credentials are saved (user must visit Settings).
    console.log('[YidDict] VerterbukService: not logged in — authenticating');
    await ensureSession(html);
    const retryHtml = await fetchSearch(query, ln);
    if (isLoggedOut(retryHtml)) {
      throw new Error('Verterbukh authentication failed — check credentials in Settings');
    }
    return parseVerterbukhhHtml(retryHtml);
  }

  return parseVerterbukhhHtml(html);
}

async function fetchSearch(query: string, ln?: string): Promise<string> {
  const params: Record<string, string> = {
    yq: query,
    dir: 'from',
    tsu: 'en',
    trns: 't',  // request YIVO romanization alongside Hebrew headwords
  };
  if (ln) params.ln = ln;

  const response = await axios.get(BASE_URL, { params });
  console.log(`[YidDict] VerterbukService: fetched results for "${query}"${ln ? ` (ln=${ln})` : ''}`);
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

  const entries = root.querySelectorAll('.def').map(parseDef);

  const choiceNodes = root.querySelectorAll('.choice_box .option:not(.extend)');
  const choices: VerterbukChoice[] | null =
    choiceNodes.length > 0
      ? choiceNodes.map(node => {
          const anchor = node.querySelector('a');
          const href = anchor?.getAttribute('href') ?? '';
          const lnMatch = href.match(/[?&]ln=([^&]+)/);
          return {
            label: anchor?.text.trim() ?? '',
            hebrewLemma: lnMatch ? decodeURIComponent(lnMatch[1]) : '',
          };
        }).filter(c => c.label && c.hebrewLemma)
      : null;

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

/** Walk up the ancestor chain checking for an element with a given class. */
function isInsideClass(node: ReturnType<typeof parse>, className: string): boolean {
  let parent = node.parentNode as ReturnType<typeof parse> | null;
  while (parent) {
    if (parent.classList?.contains(className)) return true;
    parent = parent.parentNode as ReturnType<typeof parse> | null;
  }
  return false;
}

function parseDef(defNode: ReturnType<typeof parse>): VerterbukEntry {
  // Headword — strip the | stem separator
  const lemmaNode = defNode.querySelector('.lemma');
  const yiddishHebrew = lemmaNode ? lemmaNode.text.replace(/\|/g, '').trim() : null;

  // YIVO romanization — the first .translit div contains only the headword romanization.
  // A second .translit div (if present) contains romanized grammar info; we skip it.
  const translitNodes = defNode.querySelectorAll('.translit');
  const yiddishRomanized = translitNodes.length > 0
    ? translitNodes[0].text.trim() || null
    : null;

  // Grammar block — .glossed spans appear in two variants in the wild:
  //   (A) <span class="gram glossed"> — both classes on the same element
  //   (B) <span class="gram"><span class="glossed"> — .gram wraps .glossed
  // .glossed also appears inside .translit divs (romanized grammar — skip those).
  const glossedNodes = defNode.querySelectorAll('.glossed');
  let partOfSpeech: string | null = null;
  const grammaticalParts: string[] = [];

  for (const glossed of glossedNodes) {
    // Skip romanized grammar inside .translit divs
    if (isInsideClass(glossed, 'translit')) continue;

    const helpNode = glossed.querySelector('.help');
    const englishLabel = helpNode?.text.trim() ?? null;
    if (!englishLabel) continue;

    // Strip the English label text and surrounding parentheses to get the Yiddish particle
    const yiddishParticle = helpNode
      ? glossed.text.replace(helpNode.text, '').replace(/^[\s()]+|[\s()]+$/g, '')
      : glossed.text.replace(/^[\s()]+|[\s()]+$/g, '');

    // Primary POS: variant A (.gram on same element) or variant B (.gram is immediate parent)
    const isPrimary =
      glossed.classList.contains('gram') ||
      (glossed.parentNode as ReturnType<typeof parse> | null)?.classList?.contains('gram') === true;

    if (isPrimary && !partOfSpeech) {
      partOfSpeech = englishLabel;
    } else if (!isPrimary && !isInsideClass(glossed, 'gram')) {
      // Secondary grammar: "plural: עך", "past participle: איז געלאָפֿן", etc.
      const part = yiddishParticle
        ? `${englishLabel}: ${yiddishParticle}`
        : englishLabel;
      grammaticalParts.push(part);
    }
  }

  const grammaticalInfo = grammaticalParts.length > 0 ? grammaticalParts.join('; ') : null;

  // Definitions and example phrases — .gloss and .sep alternate
  // First .gloss = main definition; .sep + following .gloss = example pair
  const allNodes = defNode.childNodes;
  let english: string | null = null;
  let exampleYiddish: string | null = null;
  let exampleEnglish: string | null = null;
  let lastWasSep = false;

  for (const node of allNodes) {
    if (!('classList' in node)) continue;
    const el = node as ReturnType<typeof parse>;

    if (el.classList?.contains('gloss')) {
      const text = el.text.trim();
      if (!english) {
        english = text;
      } else if (lastWasSep) {
        exampleEnglish = text;
      }
      lastWasSep = false;
    } else if (el.classList?.contains('sep')) {
      exampleYiddish = el.text.trim();
      lastWasSep = true;
    }
  }

  return { yiddishHebrew, yiddishRomanized, partOfSpeech, grammaticalInfo, english, exampleYiddish, exampleEnglish };
}
