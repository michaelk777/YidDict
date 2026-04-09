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
// HTML fixtures (captured from live endpoint 2026-04-08)
// ---------------------------------------------------------------------------

const NOUN_HTML = `
<div id="definition">
  <div class="def">
    <div dir="rtl" lang="yi" class="rtl">
      <span class="lemma">פּאַסירל</span>
    </div>
    <div dir="rtl" lang="yi" class="rtl">
      <span class="gram glossed">דאָס <span class="help">neuter noun</span></span>
      <span class="glossed">(עך <span class="help">plural</span>)</span>
    </div>
    <div lang="en" class="gloss">pass, permit</div>
  </div>
</div>
`;

const VERB_HTML = `
<div id="definition">
  <div class="def">
    <div dir="rtl" lang="yi" class="rtl">
      <span class="lemma">לױפֿ|ן</span>
    </div>
    <div dir="rtl" lang="yi" class="rtl">
      <span class="gram glossed">װ <span class="help">verb</span></span>
      <span class="glossed">(איז געלאָפֿן <span class="help">past participle</span>)</span>
    </div>
    <div lang="en" class="gloss">run; <span class="field">(water, fluids)</span> flow; <span class="field">(time)</span> fly</div>
    <div dir="rtl" lang="yi" class="rtl sep">
      <span>זאָל ער/זי לױפֿן און בעטן</span>
    </div>
    <div lang="en" class="gloss">may he/she make haste and intercede on our behalf in Heaven</div>
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

describe('parseVerterbukhhHtml — noun entry', () => {
  it('extracts the headword with no stem separator', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].yiddishHebrew).toBe('פּאַסירל');
  });

  it('extracts the primary part of speech from .gram.glossed', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].partOfSpeech).toBe('neuter noun');
  });

  it('extracts secondary grammatical info (plural)', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].grammaticalInfo).toContain('plural');
    expect(entries[0].grammaticalInfo).toContain('עך');
  });

  it('extracts the English definition', () => {
    const { entries } = parseVerterbukhhHtml(NOUN_HTML);
    expect(entries[0].english).toBe('pass, permit');
  });

  it('returns null for example fields when no .sep is present', () => {
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
// Parser — verb with example phrase
// ---------------------------------------------------------------------------

describe('parseVerterbukhhHtml — verb entry', () => {
  it('strips the | stem separator from the headword', () => {
    const { entries } = parseVerterbukhhHtml(VERB_HTML);
    expect(entries[0].yiddishHebrew).toBe('לױפֿן');
    expect(entries[0].yiddishHebrew).not.toContain('|');
  });

  it('extracts verb as primary part of speech', () => {
    const { entries } = parseVerterbukhhHtml(VERB_HTML);
    expect(entries[0].partOfSpeech).toBe('verb');
  });

  it('extracts past participle in grammaticalInfo', () => {
    const { entries } = parseVerterbukhhHtml(VERB_HTML);
    expect(entries[0].grammaticalInfo).toContain('past participle');
    expect(entries[0].grammaticalInfo).toContain('איז געלאָפֿן');
  });

  it('extracts the main definition as the first .gloss', () => {
    const { entries } = parseVerterbukhhHtml(VERB_HTML);
    expect(entries[0].english).toContain('run');
  });

  it('extracts the Yiddish example phrase from .sep', () => {
    const { entries } = parseVerterbukhhHtml(VERB_HTML);
    expect(entries[0].exampleYiddish).toContain('לױפֿן');
  });

  it('extracts the example translation from the second .gloss', () => {
    const { entries } = parseVerterbukhhHtml(VERB_HTML);
    expect(entries[0].exampleEnglish).toContain('make haste');
  });
});

// ---------------------------------------------------------------------------
// Parser — disambiguation
// ---------------------------------------------------------------------------

describe('parseVerterbukhhHtml — disambiguation', () => {
  it('returns choices when .choice_container is present', () => {
    const { choices } = parseVerterbukhhHtml(DISAMBIGUATION_HTML);
    expect(choices).not.toBeNull();
    expect(choices!.length).toBe(3); // excludes .extend
  });

  it('extracts YIVO label for each choice', () => {
    const { choices } = parseVerterbukhhHtml(DISAMBIGUATION_HTML);
    expect(choices!.map(c => c.label)).toEqual(['LOYF', 'LOYFN', 'AVEKLOYFN']);
  });

  it('extracts Hebrew lemma for each choice', () => {
    const { choices } = parseVerterbukhhHtml(DISAMBIGUATION_HTML);
    expect(choices!.map(c => c.hebrewLemma)).toEqual(['לױף', 'לױפֿן', 'אַװעקלױפֿן']);
  });

  it('still returns the current entry alongside choices', () => {
    const { entries } = parseVerterbukhhHtml(DISAMBIGUATION_HTML);
    expect(entries.length).toBe(1);
    expect(entries[0].yiddishHebrew).toBe('לױפֿן');
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
      params: { yq: 'pasirl', dir: 'from', tsu: 'en' },
    });
  });

  it('includes ln param when provided', async () => {
    mockGet.mockResolvedValue({ data: NOUN_HTML });
    await lookupVerterbukh('loyf', 'לױפֿן');
    expect(mockGet).toHaveBeenCalledWith('https://verterbukh.org/vb', {
      params: { yq: 'loyf', dir: 'from', tsu: 'en', ln: 'לױפֿן' },
    });
  });

  it('returns parsed entries on a clean response', async () => {
    mockGet.mockResolvedValue({ data: NOUN_HTML });
    const result = await lookupVerterbukh('pasirl');
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].english).toBe('pass, permit');
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
