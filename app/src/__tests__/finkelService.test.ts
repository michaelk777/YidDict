/**
 * finkelService.test.ts
 *
 * Unit tests for the Finkel HTTP client and HTML parser.
 *
 * The HTML fixture below was captured from a real POST word=sheyn request on
 * 2026-04-05. It covers the core entry types: plain adjective, noun with
 * Hebrew form, phrase sub-entries, loshn-koydesh entry with nested phrases,
 * and an entry with no English definition.
 *
 * REAL-WORLD INTEGRATION NOTE: These tests run against a static snapshot.
 * Before each release, run a live integration test (POST to the real endpoint)
 * to verify the parser still matches the current HTML structure. See
 * src/services/finkel-api-notes.md for full endpoint documentation.
 */

jest.mock('axios');
import axios from 'axios';
import { lookupFinkel, parseFinkelHtml } from '../services/finkelService';
import { DictEntry } from '../types';

const mockAxios = axios as jest.Mocked<typeof axios>;

// Minimal but representative fixture extracted from the real sheyn response.
const SHEYN_HTML = `<!DOCTYPE html>
<html>
<body>
<form accept-charset="UTF-8" method="post">
  <input name="word" type="text" />
</form>
<ul>
<li><span class='lexeme'>kapore(</span><span class='hebrew'>כּפּרה</span>) <span class="grammar">plural </span> kapores(<span class='hebrew'>כּפּרות</span>),  <span class="grammar">gender f,</span> <span class='definition'>atonement</span></li>
<li><ul>
  <li><span class='lexeme'>a <span class="weakmatch">sheyn</span>e reyne kapore(</span><span class='hebrew'>כּפּרה</span>) <span class='definition'>good riddance</span></li>
</ul></li>
<li><span class='lexeme'><span class="goodmatch">sheyn</span> </span><span class="grammar">gradable adjective with stem</span> shen, <span class='definition'>pretty</span>  <span class="grammar">adjectival form with</span> -ink</li>
<li><ul>
  <li><span class='lexeme'><span class="weakmatch">sheyn</span>kayt </span><span class="grammar">noun, plural in</span> -n,  <span class="grammar">gender f,</span> <span class='definition'>beauty</span></li>
</ul></li>
<li><span class='lexeme'>shney_(</span><span class='hebrew'>שני</span>) <span class='grammar'>adjective</span>, <span class='definition'>two</span> <span class='source'>indeclinable</span></li>
<li><span class='lexeme'>sheyndl </span><span class="grammar">takes dative ending,</span></li>
</ul>
<form accept-charset="UTF-8" method="post">
  <input name="word" type="text" />
</form>
</body>
</html>`;

// Response with no results (no <ul> between the forms)
const EMPTY_HTML = `<!DOCTYPE html>
<html><body>
<form accept-charset="UTF-8" method="post"><input name="word" /></form>
<form accept-charset="UTF-8" method="post"><input name="word" /></form>
</body></html>`;

describe('parseFinkelHtml', () => {
  it('returns empty array when no results ul is present', () => {
    expect(parseFinkelHtml(EMPTY_HTML)).toEqual([]);
  });

  it('returns empty array for completely empty html', () => {
    expect(parseFinkelHtml('<html><body></body></html>')).toEqual([]);
  });

  describe('with sheyn fixture', () => {
    let entries: DictEntry[];
    beforeAll(() => {
      entries = parseFinkelHtml(SHEYN_HTML);
    });

    it('returns at least 5 entries', () => {
      expect(entries.length).toBeGreaterThanOrEqual(5);
    });

    it('extracts Hebrew form for kapore including plural enrichment', () => {
      const kapore = entries.find(e => e.yiddishTransliterated?.includes('kapore') && !e.isPhrase);
      expect(kapore).toBeDefined();
      expect(kapore!.yiddishHebrew).toBe('כּפּרה, כּפּרות');
    });

    it('extracts English definition for kapore', () => {
      const kapore = entries.find(e => e.yiddishTransliterated?.includes('kapore') && !e.isPhrase);
      expect(kapore!.english).toBe('atonement');
    });

    it('extracts part of speech for kapore (gender after plural line dropped)', () => {
      const kapore = entries.find(e => e.yiddishTransliterated?.includes('kapore') && !e.isPhrase);
      expect(kapore!.partOfSpeech).toBe('gender f');
    });

    it('extracts sheyn as a main entry (not a phrase), headword unchanged', () => {
      const sheyn = entries.find(e => e.yiddishTransliterated === 'sheyn' && !e.isPhrase);
      expect(sheyn).toBeDefined();
    });

    it('extracts sheyn definition as "pretty"', () => {
      const sheyn = entries.find(e => e.yiddishTransliterated === 'sheyn' && !e.isPhrase);
      expect(sheyn!.english).toBe('pretty');
    });

    it('extracts sheyn part of speech', () => {
      const sheyn = entries.find(e => e.yiddishTransliterated === 'sheyn' && !e.isPhrase);
      expect(sheyn!.partOfSpeech).toMatch(/adjective/i);
    });

    it('marks phrase sub-entries with isPhrase=true', () => {
      const phrase = entries.find(e => e.english === 'good riddance');
      expect(phrase).toBeDefined();
      expect(phrase!.isPhrase).toBe(true);
    });

    it('extracts phrase definition correctly', () => {
      const phrase = entries.find(e => e.english === 'good riddance');
      expect(phrase!.yiddishTransliterated).toContain('kapore');
    });

    it('extracts sheynkayt as a phrase sub-entry', () => {
      const sheynkayt = entries.find(e => e.yiddishTransliterated?.includes('sheynkayt'));
      expect(sheynkayt).toBeDefined();
      expect(sheynkayt!.isPhrase).toBe(true);
      expect(sheynkayt!.english).toBe('beauty');
    });

    it('extracts loshn-koydesh entry shney_', () => {
      const shney = entries.find(e => e.yiddishTransliterated?.includes('shney'));
      expect(shney).toBeDefined();
      expect(shney!.yiddishHebrew).toBe('שני');
      expect(shney!.english).toBe('two');
    });

    it('handles entry with no English definition (sheyndl)', () => {
      const sheyndl = entries.find(e => e.yiddishTransliterated?.includes('sheyndl'));
      expect(sheyndl).toBeDefined();
      expect(sheyndl!.english).toBeNull();
    });

    it('enriches sheynkayt headword with plural suffix', () => {
      const sheynkayt = entries.find(e => e.yiddishTransliterated?.includes('sheynkayt'));
      expect(sheynkayt!.yiddishTransliterated).toBe('sheynkayt, -n');
    });

    it('includes source span text in grammaticalInfo (shney_ indeclinable)', () => {
      const shney = entries.find(e => e.yiddishTransliterated?.includes('shney'));
      expect(shney!.grammaticalInfo).toContain('indeclinable');
    });

    it('builds grammaticalInfo as newline-separated lines (sheyn)', () => {
      const sheyn = entries.find(e => e.yiddishTransliterated === 'sheyn' && !e.isPhrase);
      expect(sheyn!.grammaticalInfo).toContain('\n');
      expect(sheyn!.grammaticalInfo).toContain('gradable adjective with stem "shen"');
      expect(sheyn!.grammaticalInfo).toContain('adjectival form with "-ink"');
    });

  });

  // ---------------------------------------------------------------------------
  // Headword enrichment fixtures
  // ---------------------------------------------------------------------------

  const SKELET_HTML = `<!DOCTYPE html>
<html><body>
<form></form>
<ul>
<li><span class='lexeme'>skelet </span><span class="grammar">noun, plural in</span> -n, <span class="grammar">gender m,</span> <span class="grammar">adjectional form with '-ish',</span><span class='definition'>skeletal</span><span class='definition'>skeleton</span></li>
</ul>
<form></form>
</body></html>`;

  const LOYF_HTML = `<!DOCTYPE html>
<html><body>
<form></form>
<ul>
<li><span class='lexeme'>loyf </span><span class="grammar">verb,</span> <span class="grammar">participle</span> gelofn, <span class='definition'>run</span></li>
</ul>
<form></form>
</body></html>`;

  const SHEYNKAYT_SHEYNHAYT_HTML = `<!DOCTYPE html>
<html><body>
<form></form>
<ul>
<li><span class='lexeme'>sheynkayt </span><span class="grammar">noun, plural in</span> -n, <span class="grammar">gender f,</span> <span class='definition'>beauty</span> sheynhayt <span class="grammar">noun, plural in</span> -n, <span class="grammar">gender f,</span> <span class='definition'>beautiful person or thing</span></li>
</ul>
<form></form>
</body></html>`;

  describe('skelet — noun with secondary definition and plural suffix', () => {
    let entry: ReturnType<typeof parseFinkelHtml>[0];
    beforeAll(() => { [entry] = parseFinkelHtml(SKELET_HTML); });

    it('enriches yiddishTransliterated with plural suffix', () => {
      expect(entry.yiddishTransliterated).toBe('skelet, -n');
    });

    it('english is the main definition, not the secondary one', () => {
      expect(entry.english).toBe('skeleton');
    });

    it('secondary definition appended to its grammar line', () => {
      expect(entry.grammaticalInfo).toContain(`adjectional form with '-ish', "skeletal"`);
    });

    it('grammaticalInfo contains all three grammar lines', () => {
      expect(entry.grammaticalInfo).toBe(
        `noun\ngender m\nadjectional form with '-ish', "skeletal"`
      );
    });

    it('partOfSpeech is the first grammar line', () => {
      expect(entry.partOfSpeech).toBe('noun');
    });
  });

  describe('loyf — verb with participle enrichment', () => {
    let entry: ReturnType<typeof parseFinkelHtml>[0];
    beforeAll(() => { [entry] = parseFinkelHtml(LOYF_HTML); });

    it('enriches yiddishTransliterated with participle form', () => {
      expect(entry.yiddishTransliterated).toBe('loyf, gelofn');
    });

    it('english is correct', () => {
      expect(entry.english).toBe('run');
    });

    it('grammaticalInfo contains only the verb line (participle line dropped after enrichment)', () => {
      expect(entry.grammaticalInfo).toBe('verb');
    });

    it('partOfSpeech is the first grammar line', () => {
      expect(entry.partOfSpeech).toBe('verb');
    });
  });

  // Plain plural form ("plural [word]") with Hebrew span and weakmatch in plural
  const HIRHER_HTML = `<!DOCTYPE html>
<html><body>
<form></form>
<ul>
<li><span class='lexeme'><span class="goodmatch">hirher</span>(</span><span class='hebrew'>הירהור</span>) <span class="grammar">plural </span> hirhurem(<span class='hebrew'>הירהורים</span>),  <span class="grammar">gender m,</span> <span class='definition'>(transient) thought; doubt; sexual thought</span></li>
</ul>
<form></form>
</body></html>`;

  // Same pattern but plural form split across weakmatch + text (like kapore in real responses)
  const KAPORE_WEAKMATCH_HTML = `<!DOCTYPE html>
<html><body>
<form></form>
<ul>
<li><span class='lexeme'><span class="goodmatch">kapore</span>(</span><span class='hebrew'>כּפּרה</span>) <span class="grammar">plural </span> <span class="weakmatch">kapore</span>s(<span class='hebrew'>כּפּרות</span>),  <span class="grammar">gender f,</span> <span class='definition'>atonement</span></li>
</ul>
<form></form>
</body></html>`;

  describe('hirher — plain plural form with Hebrew span', () => {
    let entry: ReturnType<typeof parseFinkelHtml>[0];
    beforeAll(() => { [entry] = parseFinkelHtml(HIRHER_HTML); });

    it('enriches yiddishTransliterated with full plural form', () => {
      expect(entry.yiddishTransliterated).toBe('hirher, hirhurem');
    });

    it('enriches yiddishHebrew with plural Hebrew span', () => {
      expect(entry.yiddishHebrew).toBe('הירהור, הירהורים');
    });

    it('english is correct', () => {
      expect(entry.english).toBe('(transient) thought; doubt; sexual thought');
    });

    it('drops plural line, leaving gender in grammaticalInfo', () => {
      expect(entry.grammaticalInfo).toBe('gender m');
    });

    it('partOfSpeech is gender after plural line dropped', () => {
      expect(entry.partOfSpeech).toBe('gender m');
    });
  });

  describe('kapore with weakmatch — plural split across weakmatch span + text node', () => {
    let entry: ReturnType<typeof parseFinkelHtml>[0];
    beforeAll(() => { [entry] = parseFinkelHtml(KAPORE_WEAKMATCH_HTML); });

    it('assembles full YIVO plural from weakmatch + text', () => {
      expect(entry.yiddishTransliterated).toBe('kapore, kapores');
    });

    it('enriches yiddishHebrew with plural Hebrew span', () => {
      expect(entry.yiddishHebrew).toBe('כּפּרה, כּפּרות');
    });

    it('partOfSpeech is gender after plural line dropped', () => {
      expect(entry.partOfSpeech).toBe('gender f');
    });
  });

  // Plural-only entry: lexeme is "-", no Hebrew before grammar span
  const HOYRIES_HTML = `<!DOCTYPE html>
<html><body>
<form></form>
<ul>
<li><ul><li>    <span class='lexeme'>- </span><span class="grammar">plural </span> hoyries(<span class='hebrew'>הוריות</span>), <span class='definition'>dreams, daydreams; tractate of Talmud</span></li></ul></li>
</ul>
<form></form>
</body></html>`;

  describe('hoyries — plural-only entry, Hebrew span is the plural form', () => {
    let entry: ReturnType<typeof parseFinkelHtml>[0];
    beforeAll(() => { [entry] = parseFinkelHtml(HOYRIES_HTML); });

    it('yiddishTransliterated shows dash headword with plural', () => {
      expect(entry.yiddishTransliterated).toBe('-, hoyries');
    });

    it('yiddishHebrew is the plural Hebrew form (no singular)', () => {
      expect(entry.yiddishHebrew).toBe('הוריות');
    });

    it('english is correct', () => {
      expect(entry.english).toBe('dreams, daydreams; tractate of Talmud');
    });

    it('grammaticalInfo is null (plural line dropped, no other grammar)', () => {
      expect(entry.grammaticalInfo).toBeNull();
    });
  });

  describe('sheynkayt/sheynhayt — multi-entry <li> split', () => {
    let entries: ReturnType<typeof parseFinkelHtml>;
    beforeAll(() => { entries = parseFinkelHtml(SHEYNKAYT_SHEYNHAYT_HTML); });

    it('produces two entries from one <li>', () => {
      expect(entries).toHaveLength(2);
    });

    it('first entry is sheynkayt with plural enrichment', () => {
      expect(entries[0].yiddishTransliterated).toBe('sheynkayt, -n');
      expect(entries[0].english).toBe('beauty');
    });

    it('second entry is sheynhayt with plural enrichment', () => {
      expect(entries[1].yiddishTransliterated).toBe('sheynhayt, -n');
      expect(entries[1].english).toBe('beautiful person or thing');
    });
  });
});

describe('lookupFinkel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POSTs to the Finkel URL with word param', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: SHEYN_HTML });
    await lookupFinkel('sheyn');
    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('dictionary.cgi'),
      expect.stringContaining('word=sheyn'),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );
  });

  it('returns parsed entries on success', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: SHEYN_HTML });
    const result = await lookupFinkel('sheyn');
    expect(result.length).toBeGreaterThan(0);
  });

  it('falls back to base= param when word= returns no results', async () => {
    mockAxios.post
      .mockResolvedValueOnce({ data: EMPTY_HTML })   // Stage 1: word= → empty
      .mockResolvedValueOnce({ data: SHEYN_HTML });   // Stage 2: base= → results
    const result = await lookupFinkel('sheyne');
    expect(mockAxios.post).toHaveBeenCalledTimes(2);
    const secondCall = mockAxios.post.mock.calls[1];
    expect(secondCall[1]).toContain('base=sheyne');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not make a second call when word= returns results', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: SHEYN_HTML });
    await lookupFinkel('sheyn');
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
  });

  it('does not modify Latin input before POSTing', async () => {
    mockAxios.post.mockResolvedValue({ data: EMPTY_HTML });
    await lookupFinkel('sheyne', false);
    const body = mockAxios.post.mock.calls[0][1] as string;
    expect(body).toContain('word=sheyne');
  });

  it('strips nekudes from Hebrew input before POSTing', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: EMPTY_HTML });
    mockAxios.post.mockResolvedValueOnce({ data: EMPTY_HTML });
    // שֵׁין with tsere (U+05B5) on shin
    await lookupFinkel('שֵׁין', true);
    const body = mockAxios.post.mock.calls[0][1] as string;
    // Should not contain tsere (U+05B5)
    expect(body).not.toMatch(/\u05B5/);
  });

  it('returns empty array when both stages find nothing', async () => {
    mockAxios.post.mockResolvedValue({ data: EMPTY_HTML });
    const result = await lookupFinkel('xyznotaword');
    expect(result).toEqual([]);
  });

  it('propagates network errors', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('Network Error'));
    await expect(lookupFinkel('sheyn')).rejects.toThrow('Network Error');
  });
});
