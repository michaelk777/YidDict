import { markPartialHebrew } from '../utils/hebrewDisplay';

// Same LRI/PDI isolate marks as markPartialHebrew wraps its "(partial)" label in.
const LRI = '⁦';
const PDI = '⁩';

describe('markPartialHebrew()', () => {
  it('appends a "(partial)" label when hebrewIsPartial is true', () => {
    expect(markPartialHebrew('מעשׂה', true)).toBe(`מעשׂה ${LRI}(partial)${PDI}`);
  });

  it('returns the Hebrew unchanged when hebrewIsPartial is false', () => {
    expect(markPartialHebrew('חצוף', false)).toBe('חצוף');
  });

  it('returns the Hebrew unchanged when hebrewIsPartial is undefined', () => {
    expect(markPartialHebrew('חצוף', undefined)).toBe('חצוף');
  });

  it('returns null unchanged when yiddishHebrew is null, even if partial', () => {
    expect(markPartialHebrew(null, true)).toBeNull();
  });
});
