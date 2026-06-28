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

  // -------------------------------------------------------------------------
  // makhn a vayivrekh — phrase sub-entry in sibling <li> (no lexeme)
  // -------------------------------------------------------------------------
  const VAYIVREKH_HTML = `<!DOCTYPE html>
<html><body>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
<ul>
<li><span class='lexeme'>vayivrekh(</span><span class='hebrew'>ויבֿרח</span>)  <span class="grammar">gender m,</span> <span class='definition'>escape, running away</span></li>
<li><ul><li>    <span class='lexeme'>makhn a vayivrekh(</span><span class='hebrew'>ויבֿרח</span>) <span class='definition'>escape, run away</span></li></ul></li>
</ul>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
</body></html>`;

  describe('vayivrekh — phrase sub-entry in sibling no-lexeme <li>', () => {
    let entries: ReturnType<typeof parseFinkelHtml>;
    beforeAll(() => { entries = parseFinkelHtml(VAYIVREKH_HTML); });

    it('produces both vayivrekh and makhn a vayivrekh', () => {
      expect(entries).toHaveLength(2);
    });

    it('first entry is vayivrekh with correct grammar and english', () => {
      expect(entries[0].yiddishTransliterated).toBe('vayivrekh');
      expect(entries[0].yiddishHebrew).toBe('ויבֿרח');
      expect(entries[0].english).toBe('escape, running away');
    });

    it('second entry is makhn a vayivrekh as a phrase', () => {
      const phrase = entries.find(e => e.yiddishTransliterated === 'makhn a vayivrekh');
      expect(phrase).toBeDefined();
      expect(phrase!.isPhrase).toBe(true);
      expect(phrase!.english).toBe('escape, run away');
      expect(phrase!.yiddishHebrew).toBe('ויבֿרח');
    });
  });

  // -------------------------------------------------------------------------
  // Alternative headword extraction
  // -------------------------------------------------------------------------

  const ONGELOYF_HTML = `<!DOCTYPE html>
<html><body>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
<ul>
<li><span class='lexeme'>o'ngeloyf </span><span class="grammar">noun, plural in</span> -n,  <span class="grammar">gender n,</span> o'ngelaf <span class="grammar">noun, plural in</span> -n,  <span class="grammar">gender n,</span> tsunoyfloyf <span class="grammar">noun, plural in</span> -n,  <span class="grammar">gender n,</span> <span class='definition'>stampede; running to something</span></li>
</ul>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
</body></html>`;

  const ANTLOYF_HTML = `<!DOCTYPE html>
<html><body>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
<ul>
<li><span class='lexeme'>antloyf  </span><span class="grammar">gender m,</span> antloy'fenish <span class="grammar">noun, plural in</span> -n,  <span class="grammar">gender n,</span> <span class='definition'>running away</span></li>
</ul>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
</body></html>`;

  describe("o'ngeloyf — three headwords sharing one definition", () => {
    let entry: DictEntry;
    beforeAll(() => { [entry] = parseFinkelHtml(ONGELOYF_HTML); });

    it('produces exactly one entry', () => {
      expect(parseFinkelHtml(ONGELOYF_HTML)).toHaveLength(1);
    });

    it('main headword is enriched with plural suffix', () => {
      expect(entry.yiddishTransliterated).toBe("o'ngeloyf, -n");
    });

    it('partOfSpeech is noun', () => {
      expect(entry.partOfSpeech).toBe('noun');
    });

    it('english is correct', () => {
      expect(entry.english).toBe('stampede; running to something');
    });

    it('grammaticalInfo includes gender and also: line with bold marker and full grammar for each alt', () => {
      expect(entry.grammaticalInfo).toContain('gender n');
      expect(entry.grammaticalInfo).toContain(
        "*also:* o'ngelaf, noun, plural in -n, gender n;\r" + "tsunoyfloyf, noun, plural in -n, gender n"
      );
    });

    it('grammaticalInfo does not contain quoted alt headword names', () => {
      expect(entry.grammaticalInfo).not.toMatch(/"o'ngelaf"/);
      expect(entry.grammaticalInfo).not.toMatch(/"tsunoyfloyf"/);
    });
  });

  describe("antloyf — two headwords with differing grammar", () => {
    let entry: DictEntry;
    beforeAll(() => { [entry] = parseFinkelHtml(ANTLOYF_HTML); });

    it('main headword is antloyf with no plural enrichment', () => {
      expect(entry.yiddishTransliterated).toBe('antloyf');
    });

    it('partOfSpeech reflects gender-only grammar of main headword', () => {
      expect(entry.partOfSpeech).toBe('gender m');
    });

    it('english is correct', () => {
      expect(entry.english).toBe('running away');
    });

    it("grammaticalInfo includes bold also: line for antloy'fenish with full grammar", () => {
      expect(entry.grammaticalInfo).toContain("*also:* antloy'fenish, noun, plural in -n, gender n");
    });
  });

  // -------------------------------------------------------------------------
  // Empty-lexeme sub-sense merging
  // -------------------------------------------------------------------------

  const KOKH_HTML = `<!DOCTYPE html>
<html><body>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
<ul>
<li><span class='lexeme'>kokh </span><span class="grammar">verb</span>, <span class="grammar">participle</span> ge...t, <span class='definition'>cook, bake</span>  <span class="grammar">adverbial complement </span>op, oys, on, ayn
</li>
<li><ul><li>     <span class='lexeme'></span><span class="grammar">adverbial complement </span>iber, <span class='definition'>consider, cogitate</span>
</li>
</ul></li>
</ul>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
</body></html>`;

  const GROB_HTML = `<!DOCTYPE html>
<html><body>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
<ul>
<li><span class='lexeme'>grob </span><span class="grammar">verb</span>, <span class="grammar">participle</span> gegrobn, <span class='definition'>dig</span>  <span class="grammar">adverbial complement </span>arayn
</li>
<li><ul>
<li><span class='lexeme'></span><span class="grammar">adverbial complement </span>unter, <span class='definition'>slander</span></li>
<li><span class='lexeme'></span><span class="grammar">adverbial complement </span>oyf, <span class='definition'>unearth</span></li>
<li><span class='lexeme'>bagrob </span><span class="grammar">verb</span>, <span class="grammar">participle</span> bagrobn, <span class='definition'>bury</span></li>
</ul></li>
</ul>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
</body></html>`;

  // -------------------------------------------------------------------------
  // Inline alt headwords: def → bare → def pattern
  // -------------------------------------------------------------------------

  const KIND_HTML = `<!DOCTYPE html>
<html><body>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
<ul>
<li><span class='lexeme'>kind </span><span class="grammar">noun, plural in</span> -er,  <span class="grammar">gender n,</span> <span class='definition'>child</span> kindenyu <span class='definition'>dear child</span>
</li>
</ul>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
</body></html>`;

  const DALES_HTML = `<!DOCTYPE html>
<html><body>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
<ul>
<li><span class='lexeme'>dales(</span><span class='hebrew'>דלות</span>)  <span class="grammar">gender m,</span> <span class='definition'>poverty; pauper</span>  <span class="grammar">plural </span> daleysem(<span class='hebrew'>דליתים</span>), <span class='definition'>paupers</span>
</li>
</ul>
<form accept-charset="UTF-8" method="post"><input name="word" type="text" /></form>
</body></html>`;

  describe('kind — inline alt headword (def → bare → def, no grammar on alt)', () => {
    let entry: DictEntry;
    beforeAll(() => { [entry] = parseFinkelHtml(KIND_HTML); });

    it('produces one entry', () => {
      expect(parseFinkelHtml(KIND_HTML)).toHaveLength(1);
    });

    it('primary english is "child"', () => {
      expect(entry.english).toBe('child');
    });

    it('headword is enriched with plural suffix', () => {
      expect(entry.yiddishTransliterated).toBe('kind, -er');
    });

    it('grammaticalInfo contains inline also: line for kindenyu', () => {
      expect(entry.grammaticalInfo).toContain('*also:* kindenyu — dear child');
    });

    it('grammaticalInfo does not contain "child" in the grammar display', () => {
      // "child" is the english, not a grammar annotation
      expect(entry.grammaticalInfo).not.toContain('"child"');
    });
  });

  describe('dales — dual-definition with plural form (no spurious also: line)', () => {
    let entry: DictEntry;
    beforeAll(() => { [entry] = parseFinkelHtml(DALES_HTML); });

    it('produces one entry', () => {
      expect(parseFinkelHtml(DALES_HTML)).toHaveLength(1);
    });

    it('primary english is the singular meaning', () => {
      expect(entry.english).toBe('poverty; pauper');
    });

    it('headword is enriched with plural form', () => {
      expect(entry.yiddishTransliterated).toBe('dales, daleysem');
    });

    it('Hebrew is enriched with plural Hebrew', () => {
      expect(entry.yiddishHebrew).toBe('דלות, דליתים');
    });

    it('grammaticalInfo has no spurious also: line', () => {
      expect(entry.grammaticalInfo).not.toContain('also:');
    });
  });

  describe('kokh — empty-lexeme sub-sense merged into parent', () => {
    let entries: DictEntry[];
    beforeAll(() => { entries = parseFinkelHtml(KOKH_HTML); });

    it('produces only one entry (no null-headword orphan)', () => {
      expect(entries).toHaveLength(1);
    });

    it('main entry has correct headword and english', () => {
      expect(entries[0].yiddishTransliterated).toBe('kokh, ge...t');
      expect(entries[0].english).toBe('cook, bake');
    });

    it('main grammaticalInfo includes both adverbial complement lines', () => {
      expect(entries[0].grammaticalInfo).toContain('adverbial complement "op, oys, on, ayn"');
      expect(entries[0].grammaticalInfo).toContain('adverbial complement "iber" — consider, cogitate');
    });
  });

  describe('grob — multiple empty-lexeme sub-senses merged into parent, sibling entries unaffected', () => {
    let entries: DictEntry[];
    beforeAll(() => { entries = parseFinkelHtml(GROB_HTML); });

    it('produces two entries: grob and bagrob', () => {
      expect(entries).toHaveLength(2);
    });

    it('grob entry has all three adverbial complement lines in grammaticalInfo', () => {
      const grob = entries.find(e => e.yiddishTransliterated?.startsWith('grob'));
      expect(grob).toBeDefined();
      expect(grob!.grammaticalInfo).toContain('adverbial complement "arayn"');
      expect(grob!.grammaticalInfo).toContain('adverbial complement "unter" — slander');
      expect(grob!.grammaticalInfo).toContain('adverbial complement "oyf" — unearth');
    });

    it('bagrob is a separate entry with its own headword', () => {
      const bagrob = entries.find(e => e.yiddishTransliterated?.startsWith('bagrob'));
      expect(bagrob).toBeDefined();
      expect(bagrob!.english).toBe('bury');
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
