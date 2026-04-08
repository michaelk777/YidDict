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
import { lookupFinkel, parseFinkelHtml, FinkelEntry } from '../services/finkelService';

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
    let entries: FinkelEntry[];
    beforeAll(() => {
      entries = parseFinkelHtml(SHEYN_HTML);
    });

    it('returns at least 5 entries', () => {
      expect(entries.length).toBeGreaterThanOrEqual(5);
    });

    it('extracts Hebrew form for kapore', () => {
      const kapore = entries.find(e => e.yiddishRomanized?.includes('kapore') && !e.isPhrase);
      expect(kapore).toBeDefined();
      expect(kapore!.yiddishHebrew).toBe('כּפּרה');
    });

    it('extracts English definition for kapore', () => {
      const kapore = entries.find(e => e.yiddishRomanized?.includes('kapore') && !e.isPhrase);
      expect(kapore!.english).toBe('atonement');
    });

    it('extracts part of speech for kapore (first grammar span)', () => {
      const kapore = entries.find(e => e.yiddishRomanized?.includes('kapore') && !e.isPhrase);
      expect(kapore!.partOfSpeech).toMatch(/plural/i);
    });

    it('extracts sheyn as a main entry (not a phrase)', () => {
      const sheyn = entries.find(e => e.yiddishRomanized === 'sheyn' && !e.isPhrase);
      expect(sheyn).toBeDefined();
    });

    it('extracts sheyn definition as "pretty"', () => {
      const sheyn = entries.find(e => e.yiddishRomanized === 'sheyn' && !e.isPhrase);
      expect(sheyn!.english).toBe('pretty');
    });

    it('extracts sheyn part of speech', () => {
      const sheyn = entries.find(e => e.yiddishRomanized === 'sheyn' && !e.isPhrase);
      expect(sheyn!.partOfSpeech).toMatch(/adjective/i);
    });

    it('marks phrase sub-entries with isPhrase=true', () => {
      const phrase = entries.find(e => e.english === 'good riddance');
      expect(phrase).toBeDefined();
      expect(phrase!.isPhrase).toBe(true);
    });

    it('extracts phrase definition correctly', () => {
      const phrase = entries.find(e => e.english === 'good riddance');
      expect(phrase!.yiddishRomanized).toContain('kapore');
    });

    it('extracts sheynkayt as a phrase sub-entry', () => {
      const sheynkayt = entries.find(e => e.yiddishRomanized?.includes('sheynkayt'));
      expect(sheynkayt).toBeDefined();
      expect(sheynkayt!.isPhrase).toBe(true);
      expect(sheynkayt!.english).toBe('beauty');
    });

    it('extracts loshn-koydesh entry shney_', () => {
      const shney = entries.find(e => e.yiddishRomanized?.includes('shney'));
      expect(shney).toBeDefined();
      expect(shney!.yiddishHebrew).toBe('שני');
      expect(shney!.english).toBe('two');
    });

    it('handles entry with no English definition (sheyndl)', () => {
      const sheyndl = entries.find(e => e.yiddishRomanized?.includes('sheyndl'));
      expect(sheyndl).toBeDefined();
      expect(sheyndl!.english).toBeNull();
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
    const body: string = mockAxios.post.mock.calls[0][1];
    expect(body).toContain('word=sheyne');
  });

  it('strips nekudes from Hebrew input before POSTing', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: EMPTY_HTML });
    mockAxios.post.mockResolvedValueOnce({ data: EMPTY_HTML });
    // שֵׁין with tsere (U+05B5) on shin
    await lookupFinkel('שֵׁין', true);
    const body: string = mockAxios.post.mock.calls[0][1];
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
