import { parseGrammarSegments } from '../utils/grammarText';

describe('parseGrammarSegments', () => {
  it('returns a single plain segment when there are no markers', () => {
    expect(parseGrammarSegments('v.')).toEqual([{ text: 'v.', emphasized: false }]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseGrammarSegments('')).toEqual([]);
  });

  it('marks a trailing *...* segment as emphasized (shaynen-style)', () => {
    expect(parseGrammarSegments('שײַנען *דאַט*')).toEqual([
      { text: 'שײַנען ', emphasized: false },
      { text: 'דאַט', emphasized: true },
    ]);
  });

  it('marks a leading *...* segment as emphasized', () => {
    expect(parseGrammarSegments('*DAT* DEM MARKh')).toEqual([
      { text: 'DAT', emphasized: true },
      { text: ' DEM MARKh', emphasized: false },
    ]);
  });

  it('marks a mid-string *...* segment as emphasized (marrow-style)', () => {
    expect(parseGrammarSegments("BAY/FUN *DAT* DEM MARKh")).toEqual([
      { text: 'BAY/FUN ', emphasized: false },
      { text: 'DAT', emphasized: true },
      { text: ' DEM MARKh', emphasized: false },
    ]);
  });

  it('handles multiple *...* markers in one line', () => {
    expect(parseGrammarSegments('a *X* b *Y* c')).toEqual([
      { text: 'a ', emphasized: false },
      { text: 'X', emphasized: true },
      { text: ' b ', emphasized: false },
      { text: 'Y', emphasized: true },
      { text: ' c', emphasized: false },
    ]);
  });

  it('handles a line consisting only of a marker', () => {
    expect(parseGrammarSegments('*DAT*')).toEqual([{ text: 'DAT', emphasized: true }]);
  });
});
