import { hebrewToYivo } from '../utils/hebrewToYivo';

describe('hebrewToYivo()', () => {
  // ---------------------------------------------------------------------------
  // Guard conditions
  // ---------------------------------------------------------------------------

  it('returns null for empty string', () => {
    expect(hebrewToYivo('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(hebrewToYivo('   ')).toBeNull();
  });

  it('returns null if input contains no Hebrew characters', () => {
    expect(hebrewToYivo('shalom')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Single letters
  // ---------------------------------------------------------------------------

  it('converts pasekh-alef → a', () => {
    expect(hebrewToYivo('אַ')).toBe('a');
  });

  it('converts ב → b', () => {
    expect(hebrewToYivo('ב')).toBe('b');
  });

  it('converts ayin → e', () => {
    expect(hebrewToYivo('ע')).toBe('e');
  });

  it('converts komets-alef → o', () => {
    expect(hebrewToYivo('אָ')).toBe('o');
  });

  it('converts tsvey-vovn → v', () => {
    expect(hebrewToYivo('וו')).toBe('v');
  });

  // ---------------------------------------------------------------------------
  // Digraphs
  // ---------------------------------------------------------------------------

  it('converts shin → sh', () => {
    expect(hebrewToYivo('ש')).toBe('sh');
  });

  it('converts langer khof → kh', () => {
    expect(hebrewToYivo('ך')).toBe('kh');
  });

  it('converts langer tsadek → ts', () => {
    expect(hebrewToYivo('ץ')).toBe('ts');
  });

  it('converts tes-shin → tsh', () => {
    expect(hebrewToYivo('טש')).toBe('tsh');
  });

  it('converts zayin-shin → zh', () => {
    expect(hebrewToYivo('זש')).toBe('zh');
  });

  it('converts tsvey-yudn → ey', () => {
    expect(hebrewToYivo('יי')).toBe('ey');
  });

  it('converts vov-yud → oy', () => {
    expect(hebrewToYivo('וי')).toBe('oy');
  });

  it('converts pasekh-tsvey-yudn → ay', () => {
    expect(hebrewToYivo('ייַ')).toBe('ay');
  });

  // tsvey-yudn must not win over the longer pasekh-tsvey-yudn sequence
  it('prefers pasekh-tsvey-yudn over tsvey-yudn when the pasekh is present', () => {
    const result = hebrewToYivo('ייַנגל');
    expect(result).toMatch(/^ay/);
  });

  // ---------------------------------------------------------------------------
  // Yiddish ligature letters (tsvey-vovn, vov-yud, tsvey-yudn) and bare
  // (undotted) letters — both seen in real-world data, e.g. Google Translate
  // output, that doesn't always match the plain-letter spellings above.
  // ---------------------------------------------------------------------------

  it('converts the tsvey-yudn ligature alone → ey', () => {
    expect(hebrewToYivo('ײ')).toBe('ey');
  });

  it('converts the tsvey-vovn ligature alone → v', () => {
    expect(hebrewToYivo('װ')).toBe('v');
  });

  it('converts the vov-yud ligature alone → oy', () => {
    expect(hebrewToYivo('ױ')).toBe('oy');
  });

  it('converts the pasekh-tsvey-yudn ligature (ligature + pasekh) → ay', () => {
    expect(hebrewToYivo('ײַ')).toBe('ay');
  });

  it('converts veys (beys with rafe) → v', () => {
    expect(hebrewToYivo('בֿ')).toBe('v');
  });

  it('converts bare (undotted) alef → a', () => {
    expect(hebrewToYivo('א')).toBe('a');
  });

  it('converts bare (undotted) pe → f', () => {
    expect(hebrewToYivo('פ')).toBe('f');
  });

  // ---------------------------------------------------------------------------
  // Bare yud: word-initial + followed by a vowel letter (אעו) → glide "y";
  // word-initial + followed by a consonant, or anywhere else → vowel "i"
  // ---------------------------------------------------------------------------

  it('converts word-initial bare yud as the vowel "i" when not followed by a vowel letter', () => {
    // "יד" — yud is followed by a consonant (dalet)
    expect(hebrewToYivo('יד')).toBe('id');
  });

  it('converts word-initial bare yud as the glide "y" when followed by alef', () => {
    expect(hebrewToYivo('יאָר')).toBe('yor');
  });

  it('converts word-initial bare yud as the glide "y" when followed by ayin', () => {
    // "יעדער" (yeder, "each"/"every")
    expect(hebrewToYivo('יעדער')).toBe('yeder');
  });

  it('converts word-initial bare yud as the glide "y" when followed by vov', () => {
    expect(hebrewToYivo('יוד')).toBe('yud');
  });

  it('converts mid-word bare yud as the vowel "i"', () => {
    // "ליד" (song) — yud is the second letter, not word-initial
    expect(hebrewToYivo('ליד')).toBe('lid');
  });

  // ---------------------------------------------------------------------------
  // Shtumer alef (silent, undotted) before a yud or the tsvey-yudn ligature
  // ---------------------------------------------------------------------------

  it('drops a word-initial shtumer alef before a bare yud', () => {
    // "איר" (ir, "you"/"her") — bare alef is silent, yud is the vowel "i"
    expect(hebrewToYivo('איר')).toBe('ir');
  });

  it('drops a mid-word shtumer alef before the tsvey-yudn ligature', () => {
    // "פֿאַראײניקטע" (fareynikte, "united") — alef between resh and the
    // ligature is silent; from "פֿאַראײניקטע שטאַטן" (United States)
    expect(hebrewToYivo('פֿאַראײניקטע')).toBe('fareynikte');
  });

  it('drops a shtumer alef before the tsvey-yudn ligature', () => {
    // "אײן" (eyn, "one") — ligature spelling
    expect(hebrewToYivo('אײן')).toBe('eyn');
  });

  it('drops a shtumer alef before the plain two-yud tsvey-yudn spelling', () => {
    // "איין" (eyn, "one") — plain two-yud spelling of the same word
    expect(hebrewToYivo('איין')).toBe('eyn');
  });

  it('does not drop a vowelled alef (pasekh-alef) before a yud', () => {
    // Pasekh-alef already matches its own SEQUENCES entry ("a") before this
    // token is ever reached, so it must not be silenced.
    expect(hebrewToYivo('אַיר')).toBe('air');
  });

  // ---------------------------------------------------------------------------
  // Tsvey-yudn + khirik → "yi" (distinct from the tsvey-yudn digraph "ey"
  // and pasekh-tsvey-yudn "ay")
  // ---------------------------------------------------------------------------

  it('converts tsvey-yudn + khirik → yi (plain two-yud spelling)', () => {
    // "ייִנגל" (yingl, boy) — not in the whole-word EXCEPTIONS dictionary,
    // so this exercises the SEQUENCES rule rather than an exception lookup.
    expect(hebrewToYivo('ייִנגל')).toBe('yingl');
  });

  it('converts tsvey-yudn + khirik → yi (ligature spelling)', () => {
    expect(hebrewToYivo('ײִנגל')).toBe('yingl');
  });

  // ---------------------------------------------------------------------------
  // Langer / final forms map to the same YIVO as their regular counterpart
  // ---------------------------------------------------------------------------

  it('converts sofit mem the same as regular mem', () => {
    // "קים" — yud is mid-word, so it's the vowel "i"
    expect(hebrewToYivo('קים')).toBe('kim');
  });

  it('converts langer nun the same as regular nun', () => {
    expect(hebrewToYivo('קין')).toBe('kin');
  });

  it('converts langer khof the same as regular khof', () => {
    expect(hebrewToYivo('בוך')).toBe('bukh');
  });

  it('converts langer tsadek the same as regular tsadek', () => {
    expect(hebrewToYivo('בליץ')).toBe('blits');
  });

  // ---------------------------------------------------------------------------
  // Full word conversions
  // ---------------------------------------------------------------------------

  it('converts "שרייַען" (to shout)', () => {
    expect(hebrewToYivo('שרייַען')).toBe('shrayen');
  });

  it('converts "בוך" (book)', () => {
    expect(hebrewToYivo('בוך')).toBe('bukh');
  });

  it('converts "מענטש" (person) — in exceptions', () => {
    expect(hebrewToYivo('מענטש')).toBe('mentsh');
  });

  it('converts "גרויס" (big)', () => {
    expect(hebrewToYivo('גרויס')).toBe('groys');
  });

  it('converts "וואַסער" (water)', () => {
    expect(hebrewToYivo('וואַסער')).toBe('vaser');
  });

  it('converts "ליגן" (to lie/recline)', () => {
    expect(hebrewToYivo('ליגן')).toBe('lign');
  });

  // ---------------------------------------------------------------------------
  // Hyphenated forms (Finkel suffix patterns)
  // ---------------------------------------------------------------------------

  it('handles hyphenated suffix forms', () => {
    const result = hebrewToYivo('גרויס-ע');
    expect(result).toContain('-');
    expect(result).not.toBeNull();
  });

  it('converts both tokens of a hyphenated form', () => {
    expect(hebrewToYivo('גרין-ע')).toBe('grin-e');
  });

  // ---------------------------------------------------------------------------
  // Exceptions dictionary
  // ---------------------------------------------------------------------------

  it('returns exception for "שבת"', () => {
    expect(hebrewToYivo('שבת')).toBe('shabos');
  });

  it('returns exception for "שלום"', () => {
    expect(hebrewToYivo('שלום')).toBe('sholem');
  });

  // ---------------------------------------------------------------------------
  // Multi-word input
  // ---------------------------------------------------------------------------

  it('converts multi-word phrase with spaces', () => {
    const result = hebrewToYivo('אַ גוטער טאָג');
    expect(result).not.toBeNull();
    expect(result).toContain(' ');
  });

  // ---------------------------------------------------------------------------
  // Returns null when no YIVO produced
  // ---------------------------------------------------------------------------

  it('returns null for a string of unrecognised characters only', () => {
    expect(hebrewToYivo('123')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Ellipsis / pass-through characters (Finkel abbreviation patterns)
  // ---------------------------------------------------------------------------

  it('preserves ellipsis in abbreviated forms like "גע...ט"', () => {
    expect(hebrewToYivo('גע...ט')).toBe('ge...t');
  });
});
