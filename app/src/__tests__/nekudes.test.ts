import { stripNekudes } from '../utils/nekudes';

describe('stripNekudes', () => {
  it('returns empty string unchanged', () => {
    expect(stripNekudes('')).toBe('');
  });

  it('returns Latin text unchanged', () => {
    expect(stripNekudes('hello')).toBe('hello');
  });

  it('strips every code point in the nekudes range (U+05B0–U+05C7)', () => {
    for (let cp = 0x05B0; cp <= 0x05C7; cp++) {
      const nekude = String.fromCodePoint(cp);
      expect(stripNekudes(nekude)).toBe('');
    }
  });

  it('strips nekudes from שָׁלוֹם → שלום', () => {
    // shin+qamats+shin-dot, lamed, holam-vav, mem
    expect(stripNekudes('שָׁלוֹם')).toBe('שלום');
  });

  it('strips nekudes from אַ → א (pasekh-alef)', () => {
    expect(stripNekudes('אַ')).toBe('א');
  });

  it('strips two nekudes from a single letter: בִּ → ב (hiriq + dagesh)', () => {
    expect(stripNekudes('בִּ')).toBe('ב');
  });

  it('preserves Latin characters alongside Hebrew', () => {
    expect(stripNekudes('אַ test')).toBe('א test');
  });

  it('normalizes: voweled and unvoweled forms produce the same output', () => {
    // Core purpose: cache keys must be identical whether or not the user typed nekudes
    expect(stripNekudes('אַ')).toBe(stripNekudes('א'));
    expect(stripNekudes('שָׁלוֹם')).toBe(stripNekudes('שלום'));
  });
});
