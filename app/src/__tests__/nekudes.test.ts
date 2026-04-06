import { stripNekudes } from '../utils/nekudes';

describe('stripNekudes', () => {
  it('returns plain text unchanged', () => {
    expect(stripNekudes('hello')).toBe('hello');
  });

  it('returns empty string unchanged', () => {
    expect(stripNekudes('')).toBe('');
  });

  it('strips sheva (U+05B0)', () => {
    expect(stripNekudes('שְׁ')).not.toMatch(/\u05B0/);
  });

  it('strips dagesh (U+05BC)', () => {
    expect(stripNekudes('בּ')).toBe('ב');
  });

  it('strips patah (U+05B7)', () => {
    expect(stripNekudes('אַ')).toBe('א');
  });

  it('strips qamats (U+05B8)', () => {
    expect(stripNekudes('אָ')).toBe('א');
  });

  it('strips hiriq (U+05B4)', () => {
    expect(stripNekudes('בִּ')).toBe('ב');
  });

  it('strips all nekudes from a full word', () => {
    // פּלימעניק with dagesh on pe
    const withNekudes = 'פּלימעניק';
    const stripped = stripNekudes(withNekudes);
    expect(stripped).toBe('פלימעניק');
    expect(stripped.length).toBeLessThan(withNekudes.length);
  });

  it('preserves Hebrew consonants', () => {
    const result = stripNekudes('שֵׁין');
    expect(result).toContain('ש');
    expect(result).toContain('י');
    expect(result).toContain('ן');
  });

  it('preserves Latin characters alongside Hebrew', () => {
    expect(stripNekudes('אַ test')).toBe('א test');
  });
});
