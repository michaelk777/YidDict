import { yivoToHebrew } from '../utils/yivoToHebrew';

describe('yivoToHebrew()', () => {
  // ---------------------------------------------------------------------------
  // Guard conditions
  // ---------------------------------------------------------------------------

  it('returns null for empty string', () => {
    expect(yivoToHebrew('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(yivoToHebrew('   ')).toBeNull();
  });

  it('returns null if input already contains Hebrew characters', () => {
    expect(yivoToHebrew('שלום')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Single letters
  // ---------------------------------------------------------------------------

  it('converts single letter a', () => {
    expect(yivoToHebrew('a')).toBe('אַ');
  });

  it('converts b', () => {
    expect(yivoToHebrew('b')).toBe('ב');
  });

  it('converts e → ayin', () => {
    expect(yivoToHebrew('e')).toBe('ע');
  });

  it('converts o → komets-alef', () => {
    expect(yivoToHebrew('o')).toBe('אָ');
  });

  it('converts v → tsvey-vovn', () => {
    expect(yivoToHebrew('v')).toBe('וו');
  });

  // ---------------------------------------------------------------------------
  // Digraphs
  // ---------------------------------------------------------------------------

  it('converts sh → shin', () => {
    expect(yivoToHebrew('sh')).toBe('ש');
  });

  it('converts kh → final khof when word-final', () => {
    // standalone "kh" is word-final, so sofit form is correct
    expect(yivoToHebrew('kh')).toBe('ך');
  });

  it('converts ts → final tsadek when word-final', () => {
    // standalone "ts" is word-final, so sofit form is correct
    expect(yivoToHebrew('ts')).toBe('ץ');
  });

  it('converts tsh → tes-shin', () => {
    expect(yivoToHebrew('tsh')).toBe('טש');
  });

  it('converts zh → zayin-shin', () => {
    expect(yivoToHebrew('zh')).toBe('זש');
  });

  it('converts ey → tsvey-yudn', () => {
    expect(yivoToHebrew('ey')).toBe('יי');
  });

  it('converts oy → vov-yud', () => {
    expect(yivoToHebrew('oy')).toBe('וי');
  });

  it('converts ay → pasekh-tsvey-yudn', () => {
    expect(yivoToHebrew('ay')).toBe('ייַ');
  });

  // tsh must win over sh when tsh appears
  it('prefers tsh over sh in "tsh" sequence', () => {
    const result = yivoToHebrew('tshaynik');
    expect(result).toMatch(/^טש/);  // starts with tes-shin, not tes + shin separately
  });

  // ---------------------------------------------------------------------------
  // Sofit (final) forms
  // ---------------------------------------------------------------------------

  it('applies final mem (ם) at word end', () => {
    // i→י, m→ם (sofit); no hiriq — converter does not add vowel points to yud
    const result = yivoToHebrew('im');
    expect(result).toMatch(/ם$/);
    expect(result).toBe('ים');
  });

  it('applies final nun (ן) at word end', () => {
    const result = yivoToHebrew('kin');
    expect(result).toMatch(/ן$/);
  });

  it('applies final khof (ך) at word end for kh', () => {
    const result = yivoToHebrew('bukh');
    expect(result).toMatch(/ך$/);
  });

  it('applies final tsadek (ץ) at word end for ts', () => {
    const result = yivoToHebrew('blits');
    expect(result).toMatch(/ץ$/);
  });

  it('does not apply sofit mid-word', () => {
    // "nemen" — n is mid-word, should not be ן
    const result = yivoToHebrew('nemen');
    expect(result).not.toMatch(/ן.*ם/);   // no final-nun before final-mem pattern
    expect(result).toMatch(/ן$/);          // but final letter (m) should be ם... wait
    // Actually "nemen": n→נ e→ע m→מ e→ע n→ן(sofit)
    // Final n → ן, final m is NOT the last letter here
    expect(result).toBe('נעמען');
  });

  // ---------------------------------------------------------------------------
  // Full word conversions
  // ---------------------------------------------------------------------------

  it('converts "shrayen" (to shout)', () => {
    // sh→ש r→ר ay→ייַ e→ע n→ן(final); converter outputs plain ש, no shin-dot
    const result = yivoToHebrew('shrayen');
    expect(result).toBe('שרייַען');
  });

  it('converts "bukh" (book)', () => {
    // b→ב u→ו kh→ך(final)
    expect(yivoToHebrew('bukh')).toBe('בוך');
  });

  it('converts "mentsh" (person) — in exceptions', () => {
    expect(yivoToHebrew('mentsh')).toBe('מענטש');
  });

  it('converts "groys" (big)', () => {
    // g→ג r→ר oy→וי s→ס(not sofit)
    expect(yivoToHebrew('groys')).toBe('גרויס');
  });

  it('converts "vaser" (water)', () => {
    // v→וו a→אַ s→ס e→ע r→ר
    expect(yivoToHebrew('vaser')).toBe('וואַסער');
  });

  it('converts "lign" (to lie/recline)', () => {
    // l→ל i→י g→ג n→ן(final)
    expect(yivoToHebrew('lign')).toBe('ליגן');
  });

  // ---------------------------------------------------------------------------
  // Hyphenated forms (Finkel suffix patterns)
  // ---------------------------------------------------------------------------

  it('handles hyphenated suffix forms', () => {
    const result = yivoToHebrew('groys-e');
    expect(result).toContain('-');
    expect(result).not.toBeNull();
  });

  it('applies sofit correctly to first token of hyphenated form', () => {
    // "grin-e": grin → גרין (n is final for that token → ן)
    const result = yivoToHebrew('grin-e');
    expect(result).toContain('ן');
  });

  // ---------------------------------------------------------------------------
  // Exceptions dictionary
  // ---------------------------------------------------------------------------

  it('returns exception for "shabos"', () => {
    expect(yivoToHebrew('shabos')).toBe('שבת');
  });

  it('is case-insensitive for exceptions', () => {
    expect(yivoToHebrew('Shabos')).toBe('שבת');
  });

  it('returns exception for "sholem"', () => {
    expect(yivoToHebrew('sholem')).toBe('שלום');
  });

  // ---------------------------------------------------------------------------
  // Multi-word input
  // ---------------------------------------------------------------------------

  it('converts multi-word phrase with spaces', () => {
    const result = yivoToHebrew('a guter tog');
    expect(result).not.toBeNull();
    expect(result).toContain(' ');
  });

  // ---------------------------------------------------------------------------
  // Returns null when no Hebrew produced
  // ---------------------------------------------------------------------------

  it('returns null for a string of unrecognised characters only', () => {
    // All digits — no Hebrew chars produced
    expect(yivoToHebrew('123')).toBeNull();
  });
});
