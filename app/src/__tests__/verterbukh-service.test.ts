/**
 * verterbukh-service.test.ts
 *
 * Tests for the Verterbukh HTML parser and lookup flow.
 * Axios and the auth module are mocked — no network or credential access.
 */

import axios from 'axios';
import {
  parseVerterbukhhHtml,
  lookupVerterbukh,
} from '../services/verterbukh-service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('axios');
jest.mock('../services/verterbukh-auth', () => ({
  ensureSession: jest.fn(),
  isLoggedOut: jest.fn(),
}));

import { ensureSession, isLoggedOut } from '../services/verterbukh-auth';

const mockGet = axios.get as jest.Mock;
const mockEnsureSession = ensureSession as jest.Mock;
const mockIsLoggedOut = isLoggedOut as jest.Mock;

// ---------------------------------------------------------------------------
// HTML fixtures
// ---------------------------------------------------------------------------

// Variant A: .gram and .glossed on the same <span class="gram glossed"> element
const NOUN_HTML = `
<div id="definition">
  <div class="def">
    <div dir="rtl" lang="yi" class="rtl">
      <span class="lemma">פּאַסירל</span>
    </div>
    <div lang="en" class="translit">PASIRL</div>
    <div dir="rtl" lang="yi" class="rtl">
      <span class="gram glossed">דאָס <span class="help">neuter noun</span></span>
      <span class="glossed">(עך <span class="help">plural</span>)</span>
    </div>
    <div lang="en" class="translit">n. <span class="glossed">neut.<span class="help">neuter noun</span></span> (<span class="glossed">EKh<span class="help">plural</span></span>)</div>
    <div lang="en" class="gloss">pass, permit</div>
  </div>
</div>
`;

// Verb with past-participle headword folding + a usage phrase.
// Captured from the live response for query "loyfn" -> ln="אַװעקלױפֿן" (2026-06-06).
const AVEKLOYFN_HTML = `
<div id="definition">
  <div class="def">
    <div dir="rtl" lang="yi" class="rtl">
      <span class="lemma">אַװע'ק|לױפֿ|ן</span>
    </div>
    <div lang="en" class="translit">AVE'K|LOYF|N</div>
    <div dir="rtl" lang="yi" class="rtl"><span class="gram glossed">װ <span class="help">verb</span></span> <span class="glossed">(איז אַװע'קגעלאָפֿן<span class="help">past participle</span>)</span></div>
    <div lang="en" class="translit">v.  (<span class="glossed">IZ AVE'KGELOFN<span class="help">past participle</span></span>)</div>
    <div lang="en" class="gloss">leave hastily; run away, flee</div>
    <div dir="rtl" lang="yi" class="rtl sep">
      <span>אַװעקלױפֿן צו</span>
    </div>
    <div lang="en" class="translit">AVEKLOYFN TSU</div>
    <div lang="en" class="gloss">run/hurry to</div>
  </div>
</div>
`;

// Adjective with dual POS (adj./adv.), a comparative form, and a secondary
// adverb-only sense. Captured from the live response for query "beautiful" ->
// ln="שײן" (2026-06-06).
const SHEYN_HTML = `
<div id="definition">
  <div class="def">
    <div dir="rtl" lang="yi" class="rtl">
      <span class="lemma">שײן</span>
    </div>
    <div lang="en" class="translit">ShEYN</div>
    <div dir="rtl" lang="yi" class="rtl"><span class="gram"><span class="glossed">אַדי<span class="help">adjective</span></span>/<span class="glossed">אַדװ<span class="help">adverb</span></span></span> <span class="gram">קאָמפּ</span> <span class="glossed">שענער<span class="help">comparative</span></span></div>
    <div lang="en" class="translit"><span class="glossed">adj.<span class="help">adjective</span></span>/<span class="glossed">adv.<span class="help">adverb</span></span> comp. <span class="glossed">ShENER<span class="help">comparative</span></span></div>
    <div lang="en" class="gloss">beautiful, pretty, handsome; respectable, considerable</div>
    <div dir="rtl" lang="yi" class="rtl">
      <span class="gram">
        <span class="glossed">אַדװ<span class="help">adverb</span></span>
      </span>
    </div>
    <div lang="en" class="translit">
      <span class="glossed">adv.<span class="help">adverb</span></span>
    </div>
    <div lang="en" class="gloss"><span class="italic">also</span> good, well</div>
  </div>
</div>
`;

// Variant B: .gram wraps .glossed in separate nested elements.
// Based on actual live HTML captured 2026-04-10 (word: צײַ'געניש).
const NOUN_NESTED_HTML = `
<div id="definition">
  <div class="def">
    <div dir="rtl" lang="yi" class="rtl">
      <span class="lemma">צײַ'געניש</span>
    </div>
    <div lang="en" class="translit">TSAY'GENISh</div>
    <div dir="rtl" lang="yi" class="rtl">
      <span class="gram"><span class="glossed">דאָס<span class="help">neuter noun</span></span></span>
      <span class="glossed">(ן<span class="help">plural</span>)</span>
    </div>
    <div lang="en" class="translit">n. <span class="glossed">neut.<span class="help">neuter noun</span></span> (<span class="glossed">N<span class="help">plural</span></span>)</div>
    <div lang="en" class="gloss">certificate, diploma</div>
  </div>
</div>
`;

// Verb whose secondary phrase bakes its own grammar annotation directly into its
// Hebrew/romanized text (".gram" -> "דאַט"/"DAT" for a dative usage), distinct
// from the entry's own part of speech. Captured from the live response for query
// "sheyn" -> ln="שײַנען" (2026-06-06).
const SHAYNEN_HTML = `
<div id="definition">
  <div class="def">
    <div dir="rtl" lang="yi" class="rtl">
      <span class="lemma">שײַנ|ען</span>
    </div>
    <div lang="en" class="translit">ShAYN|EN</div>
    <div dir="rtl" lang="yi" class="rtl"><span class="gram glossed">װ <span class="help">verb</span></span> <span class="glossed">(גע—ט<span class="help">past participle</span>)</span></div>
    <div lang="en" class="translit">v.  (<span class="glossed">GE—T<span class="help">past participle</span></span>)</div>
    <div lang="en" class="gloss">shine, glow; beam</div>
    <div dir="rtl" lang="yi" class="rtl sep">
      <span>שײַנען <span class="gram"><span class="glossed">דאַט<span class="help">dative</span></span></span></span>
    </div>
    <div lang="en" class="translit">ShAYNEN <span class="gram">DAT</span></div>
    <div lang="en" class="gloss"><span class="italic">Germ.</span> seem/appear to s.o.</div>
    <div dir="rtl" lang="yi" class="rtl sep">
      <span>װי עס שײַנט</span>
    </div>
    <div lang="en" class="translit">VI ES ShAYNT</div>
    <div lang="en" class="gloss"><span class="italic">Germ.</span> as it seems, as it appears</div>
  </div>
</div>
`;

// Verb whose secondary phrase carries no grammar annotation of its own — the
// phrase line must not borrow "v." from the entry's main definition. Captured
// from the live response for query "loyfn" -> ln="לױפֿן" (2026-06-06).
const LOYFN_HTML = `
<div id="definition">
  <div class="def">
    <div dir="rtl" lang="yi" class="rtl">
      <span class="lemma">לױפֿ|ן</span>
    </div>
    <div lang="en" class="translit">LOYF|N</div>
    <div dir="rtl" lang="yi" class="rtl"><span class="gram glossed">װ <span class="help">verb</span></span> <span class="glossed">(איז געלאָפֿן<span class="help">past participle</span>)</span></div>
    <div lang="en" class="translit">v.  (<span class="glossed">IZ GELOFN<span class="help">past participle</span></span>)</div>
    <div lang="en" class="gloss">run; <span class="field">(water, fluids)</span> flow; <span class="field">(time)</span> fly; flee, fly; <span class="field">(timepiece)</span> be fast</div>
    <div dir="rtl" lang="yi" class="rtl sep">
      <span>זאָל ער/זי לױפֿן און בעטן</span>
    </div>
    <div lang="en" class="translit">ZOL ER/ZI LOYFN UN BETN</div>
    <div lang="en" class="gloss"><span class="field">(in speaking of a deceased relative)</span> may he/she make haste and intercede on our behalf in Heaven</div>
  </div>
</div>
`;

const DISAMBIGUATION_HTML = `
<div class="choice_container">
  <div class="choice_box">
    <div class="option"><a href="vb?yq=loyf&amp;ln=לױף">LOYF</a></div>
    <div class="option selected"><a href="vb?yq=loyf&amp;ln=לױפֿן">LOYFN</a></div>
    <div class="option"><a href="vb?yq=loyf&amp;ln=אַװעקלױפֿן">AVEKLOYFN</a></div>
    <div class="option extend"><a href="vb?yq=loyf&amp;extend=1">More ...</a></div>
  </div>
</div>
<div id="definition">
  <div class="def">
    <div dir="rtl" lang="yi" class="rtl">
      <span class="lemma">לױפֿ|ן</span>
    </div>
    <div lang="en" class="gloss">run</div>
  </div>
</div>
`;

// English→Yiddish disambiguation: <select class="rev-choices"> with Hebrew options.
// Captured from live response for query "run" with dir=to (2026-06-02).
const ENGLISH_DISAMBIGUATION_HTML = `
<div class="quota-box float-end">
<a href="?page=qrpt">used 36/5005 Eng.</a>
</div>
<div>
<div class="alternatives">Choices</div>
<form action="vb">
<input type="hidden" name="dir" value="to">
<input type="hidden" name="yq" value="run">
<select name="ln" class="rev-choices">
<option>&nbsp;</option>
<option>אַדמיניסטרירן</option>
<option>קאַנדידירן</option>
<option>לױפֿן</option>
<option>רינען</option>
</select>
</form>
</div>
`;

const NO_RESULTS_HTML = `<div id="definition"></div>`;

const LOGGED_OUT_HTML = `
<form action="vb" method="post">
  <input type="hidden" name="html_login" value="1">
</form>
`;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureSession.mockResolvedValue(undefined);
  mockIsLoggedOut.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// Parser — noun
// ---------------------------------------------------------------------------

describe('parseVerterbukhhHtml — noun entry with plural folding (variant A: .gram.glossed same element)', () => {
  it('strips the | stem separator and folds the plural suffix into the Hebrew headword with a dash', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].yiddishHebrew).toBe('פּאַסירל, -עך');
  });

  it('folds the romanized plural suffix into yiddishRomanized with a dash', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].yiddishRomanized).toBe('PASIRL, -EKh');
  });

  it('extracts a terse part of speech straight from Verterbukh\'s romanized grammar', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].partOfSpeech).toBe('n. neut.');
  });

  it('omits the folded plural from grammaticalInfo — no duplication with the headword', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].grammaticalInfo).toBe('n. neut.');
    expect(entries[0].grammaticalInfo).not.toContain('plural');
  });

  it('extracts the English definition', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].english).toBe('pass, permit');
  });

  it('returns null for the legacy example fields — phrases now fold into grammaticalInfo', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].exampleYiddish).toBeNull();
    expect(entries[0].exampleEnglish).toBeNull();
  });

  it('returns null choices when no .choice_container is present', () => {
    const { choices } = parseVerterbukhhHtml(NOUN_HTML);
    expect(choices).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Parser — verb with past participle + usage phrase (live HTML 2026-06-06)
// ---------------------------------------------------------------------------

describe('parseVerterbukhhHtml — verb entry with past participle + phrase (avek-loyfn)', () => {
  it('strips | stem separators and folds the past participle into the Hebrew headword', () => {
    const { entries } = parseVerterbukhhHtml(AVEKLOYFN_HTML);
    expect(entries[0].yiddishHebrew).toBe("אַװע'קלױפֿן, איז אַװע'קגעלאָפֿן");
    expect(entries[0].yiddishHebrew).not.toContain('|');
  });

  it('folds the romanized past participle (with auxiliary) into yiddishRomanized', () => {
    const { entries } = parseVerterbukhhHtml(AVEKLOYFN_HTML);
    expect(entries[0].yiddishRomanized).toBe("AVE'KLOYFN, IZ AVE'KGELOFN");
    expect(entries[0].yiddishRomanized).not.toContain('|');
  });

  it('extracts a terse part of speech, omitting the participle now folded into the headword', () => {
    const { entries } = parseVerterbukhhHtml(AVEKLOYFN_HTML);
    expect(entries[0].partOfSpeech).toBe('v.');
  });

  it('extracts the main definition as the first .gloss', () => {
    const { entries } = parseVerterbukhhHtml(AVEKLOYFN_HTML);
    expect(entries[0].english).toBe('leave hastily; run away, flee');
  });

  it('folds the usage phrase into grammaticalInfo as "{Yiddish} - {romanized} - {English}", with no POS label borrowed from the definition', () => {
    const { entries } = parseVerterbukhhHtml(AVEKLOYFN_HTML);
    expect(entries[0].grammaticalInfo).toBe(
      'v.\nאַװעקלױפֿן צו - AVEKLOYFN TSU - run/hurry to'
    );
  });

  it('returns null for the legacy example fields — the phrase now lives in grammaticalInfo', () => {
    const { entries } = parseVerterbukhhHtml(AVEKLOYFN_HTML);
    expect(entries[0].exampleYiddish).toBeNull();
    expect(entries[0].exampleEnglish).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Parser — phrase formatting: no POS carry-over; inline ".gram" annotations set
// off in parentheses (live HTML 2026-06-06)
// ---------------------------------------------------------------------------

describe('parseVerterbukhhHtml — verb entry whose phrase bakes in its own grammar annotation (shaynen)', () => {
  it('sets the inline ".gram" annotation off in parentheses, on both the Hebrew and romanized phrase text', () => {
    const { entries } = parseVerterbukhhHtml(SHAYNEN_HTML);
    expect(entries[0].grammaticalInfo).toBe(
      'v.\n' +
        'שײַנען (דאַט) - ShAYNEN (DAT) - Germ. seem/appear to s.o.\n' +
        'װי עס שײַנט - VI ES ShAYNT - Germ. as it seems, as it appears'
    );
  });

  it('excludes the ".help" tooltip text ("dative") from the rendered annotation', () => {
    const { entries } = parseVerterbukhhHtml(SHAYNEN_HTML);
    expect(entries[0].grammaticalInfo).not.toContain('dative');
  });

  it('leaves a phrase with no inline annotation as plain text, with no parentheses added', () => {
    const { entries } = parseVerterbukhhHtml(SHAYNEN_HTML);
    expect(entries[0].grammaticalInfo).toContain('װי עס שײַנט - VI ES ShAYNT -');
  });
});

describe('parseVerterbukhhHtml — verb entry whose phrase carries no grammar of its own (loyfn)', () => {
  it('does not prefix the phrase line with the entry\'s part of speech (no carry-over)', () => {
    const { entries } = parseVerterbukhhHtml(LOYFN_HTML);
    expect(entries[0].partOfSpeech).toBe('v.');
    expect(entries[0].grammaticalInfo).toBe(
      'v.\n' +
        'זאָל ער/זי לױפֿן און בעטן - ZOL ER/ZI LOYFN UN BETN - ' +
        '(in speaking of a deceased relative) may he/she make haste and intercede on our behalf in Heaven'
    );
  });
});

// ---------------------------------------------------------------------------
// Parser — adjective with dual POS, comparative, and secondary sense (live HTML 2026-06-06)
// ---------------------------------------------------------------------------

describe('parseVerterbukhhHtml — adjective entry with dual POS + comparative + secondary sense (sheyn)', () => {
  it('keeps the headword bare — comparatives are not folded in', () => {
    const { entries } = parseVerterbukhhHtml(SHEYN_HTML);
    expect(entries[0].yiddishHebrew).toBe('שײן');
    expect(entries[0].yiddishRomanized).toBe('ShEYN');
  });

  it('preserves both POS/comparative alternatives instead of dropping one (dual-alternative bug fix)', () => {
    const { entries } = parseVerterbukhhHtml(SHEYN_HTML);
    expect(entries[0].partOfSpeech).toBe('adj./adv. comp. ShENER');
  });

  it('extracts the primary definition', () => {
    const { entries } = parseVerterbukhhHtml(SHEYN_HTML);
    expect(entries[0].english).toBe('beautiful, pretty, handsome; respectable, considerable');
  });

  it('folds the secondary adverb-only sense into grammaticalInfo as "{POS} - {gloss}"', () => {
    const { entries } = parseVerterbukhhHtml(SHEYN_HTML);
    expect(entries[0].grammaticalInfo).toBe(
      'adj./adv. comp. ShENER\nadv. - also good, well'
    );
  });
});

// ---------------------------------------------------------------------------
// Parser — noun entry variant B (nested .gram > .glossed, live HTML 2026-04-10)
// ---------------------------------------------------------------------------

describe('parseVerterbukhhHtml — noun entry with plural folding (variant B: .gram wraps .glossed)', () => {
  it('folds the plural suffix into the Hebrew headword with a dash', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_NESTED_HTML);
    expect(entries[0].yiddishHebrew).toBe("צײַ'געניש, -ן");
  });

  it('folds the romanized plural suffix into yiddishRomanized with a dash', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_NESTED_HTML);
    expect(entries[0].yiddishRomanized).toBe("TSAY'GENISh, -N");
  });

  it('extracts terse POS from the nested .gram > .glossed structure', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_NESTED_HTML);
    expect(entries[0].partOfSpeech).toBe('n. neut.');
  });

  it('omits the folded plural from grammaticalInfo — no duplication with the headword', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_NESTED_HTML);
    expect(entries[0].grammaticalInfo).toBe('n. neut.');
    expect(entries[0].grammaticalInfo).not.toContain('plural');
  });

  it('extracts the English definition', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_NESTED_HTML);
    expect(entries[0].english).toBe('certificate, diploma');
  });

  it('returns null yiddishRomanized when no .translit div is present', () => {
    const noTranslit = `<div class="def"><div class="rtl"><span class="lemma">טעסט</span></div><div class="gloss">test</div></div>`;
    const { entries } = parseVerterbukhhHtml(noTranslit);
    expect(entries[0].yiddishRomanized).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Parser — disambiguation
// ---------------------------------------------------------------------------

describe('parseVerterbukhhHtml — Yiddish→English disambiguation (.choice_box)', () => {
  it('returns choices when .choice_container is present', () => {
    const { choices } = parseVerterbukhhHtml(DISAMBIGUATION_HTML);
    expect(choices).not.toBeNull();
    expect(choices!.length).toBe(3); // "More..." node excluded by empty-hebrewLemma filter
  });

  it('extracts YIVO label for each choice', () => {
    const { choices } = parseVerterbukhhHtml(DISAMBIGUATION_HTML);
    expect(choices!.map(c => c.label)).toEqual(['LOYF', 'LOYFN', 'AVEKLOYFN']);
  });

  it('extracts Hebrew lemma for each choice', () => {
    const { choices } = parseVerterbukhhHtml(DISAMBIGUATION_HTML);
    expect(choices!.map(c => c.hebrewLemma)).toEqual(['לױף', 'לױפֿן', 'אַװעקלױפֿן']);
  });

  it('sets dir=from on each choice', () => {
    const { choices } = parseVerterbukhhHtml(DISAMBIGUATION_HTML);
    expect(choices!.map(c => c.dir)).toEqual(['from', 'from', 'from']);
  });

  it('still returns the current entry alongside choices', () => {
    const { entries } = parseVerterbukhhHtml(DISAMBIGUATION_HTML);
    expect(entries.length).toBe(1);
    expect(entries[0].yiddishHebrew).toBe('לױפֿן');
  });
});

describe('parseVerterbukhhHtml — English→Yiddish disambiguation (select.rev-choices)', () => {
  it('returns choices from rev-choices select', () => {
    const { choices } = parseVerterbukhhHtml(ENGLISH_DISAMBIGUATION_HTML);
    expect(choices).not.toBeNull();
    expect(choices!.length).toBe(4);
  });

  it('uses Hebrew option text as both label and hebrewLemma', () => {
    const { choices } = parseVerterbukhhHtml(ENGLISH_DISAMBIGUATION_HTML);
    expect(choices!.map(c => c.label)).toEqual(['אַדמיניסטרירן', 'קאַנדידירן', 'לױפֿן', 'רינען']);
    expect(choices!.map(c => c.hebrewLemma)).toEqual(['אַדמיניסטרירן', 'קאַנדידירן', 'לױפֿן', 'רינען']);
  });

  it('sets dir=to on each choice', () => {
    const { choices } = parseVerterbukhhHtml(ENGLISH_DISAMBIGUATION_HTML);
    expect(choices!.map(c => c.dir)).toEqual(['to', 'to', 'to', 'to']);
  });

  it('skips the blank placeholder option', () => {
    const { choices } = parseVerterbukhhHtml(ENGLISH_DISAMBIGUATION_HTML);
    expect(choices!.every(c => c.hebrewLemma.length > 0)).toBe(true);
  });

  it('returns empty entries for a choices-only response', () => {
    const { entries } = parseVerterbukhhHtml(ENGLISH_DISAMBIGUATION_HTML);
    expect(entries).toHaveLength(0);
  });

  it('parses quota from choices-only response', () => {
    const { quota } = parseVerterbukhhHtml(ENGLISH_DISAMBIGUATION_HTML);
    expect(quota).toEqual({ used: 36, total: 5005 });
  });
});

// ---------------------------------------------------------------------------
// Parser — no results
// ---------------------------------------------------------------------------

describe('parseVerterbukhhHtml — no results', () => {
  it('returns empty entries array when no .def blocks are present', () => {
    const { entries } = parseVerterbukhhHtml(NO_RESULTS_HTML);
    expect(entries).toHaveLength(0);
  });

  it('returns null choices when no disambiguation is present', () => {
    const { choices } = parseVerterbukhhHtml(NO_RESULTS_HTML);
    expect(choices).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lookupVerterbukh — fetch and session flow
// ---------------------------------------------------------------------------

describe('lookupVerterbukh — happy path', () => {
  it('GETs the correct URL with query params', async () => {
    mockGet.mockResolvedValue({ data: NOUN_HTML });
    await lookupVerterbukh('pasirl');
    expect(mockGet).toHaveBeenCalledWith('https://verterbukh.org/vb', {
      params: { yq: 'pasirl', dir: 'from', tsu: 'en', trns: 't', extend: '1' },
    });
  });

  it('includes ln param when provided', async () => {
    mockGet.mockResolvedValue({ data: NOUN_HTML });
    await lookupVerterbukh('loyf', 'לױפֿן');
    expect(mockGet).toHaveBeenCalledWith('https://verterbukh.org/vb', {
      params: { yq: 'loyf', dir: 'from', tsu: 'en', trns: 't', extend: '1', ln: 'לױפֿן' },
    });
  });

  it('returns parsed entries on a clean response', async () => {
    mockGet.mockResolvedValue({ data: NOUN_HTML });
    const result = await lookupVerterbukh('pasirl');
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].english).toBe('pass, permit');
  });

  it('uses forcedDir when provided', async () => {
    mockGet.mockResolvedValue({ data: NOUN_HTML });
    await lookupVerterbukh('loyfn', 'לױפֿן', 'to');
    expect(mockGet).toHaveBeenCalledWith('https://verterbukh.org/vb', {
      params: { yq: 'loyfn', dir: 'to', tsu: 'en', trns: 't', extend: '1', ln: 'לױפֿן' },
    });
  });
});


describe('lookupVerterbukh — session handling', () => {
  it('re-authenticates and retries when first response is logged out', async () => {
    mockIsLoggedOut
      .mockReturnValueOnce(true)   // first response: logged out
      .mockReturnValueOnce(false); // retry response: logged in
    mockGet
      .mockResolvedValueOnce({ data: LOGGED_OUT_HTML })
      .mockResolvedValueOnce({ data: NOUN_HTML });

    const result = await lookupVerterbukh('pasirl');
    expect(mockEnsureSession).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.entries.length).toBe(1);
  });

  it('throws if still logged out after re-auth', async () => {
    mockIsLoggedOut.mockReturnValue(true);
    mockGet.mockResolvedValue({ data: LOGGED_OUT_HTML });

    await expect(lookupVerterbukh('pasirl')).rejects.toThrow(
      'Verterbukh authentication failed'
    );
  });

  it('does not call ensureSession on a clean first response', async () => {
    mockGet.mockResolvedValue({ data: NOUN_HTML });
    await lookupVerterbukh('pasirl');
    expect(mockEnsureSession).not.toHaveBeenCalled();
  });
});
