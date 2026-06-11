import React from 'react';
import { render } from '@testing-library/react-native';
import { GrammarText } from '../components/GrammarText';

describe('GrammarText', () => {
  it('renders plain text with no markers unchanged', () => {
    const { getByText } = render(<GrammarText text="v." />);
    expect(getByText('v.')).toBeTruthy();
  });

  it('renders a *...*-marked segment as bold and non-italic, separate from the surrounding text', () => {
    const { getByText } = render(<GrammarText text="שײַנען *דאַט* - ShAYNEN *DAT*" />);

    const hebrewAnnotation = getByText('דאַט');
    const romanizedAnnotation = getByText('DAT');

    for (const node of [hebrewAnnotation, romanizedAnnotation]) {
      const flatStyle = StyleSheetFlatten(node.props.style);
      expect(flatStyle.fontWeight).toBe('bold');
      expect(flatStyle.fontStyle).toBe('normal');
    }
  });

  it('renders each \\n-separated line of multi-line grammaticalInfo', () => {
    const { getByText } = render(<GrammarText text={'v.\nfoo *DAT* bar'} />);
    expect(getByText('v.', { exact: false })).toBeTruthy();
    expect(getByText('foo ', { exact: false })).toBeTruthy();
    expect(getByText('DAT')).toBeTruthy();
  });
});

// Mirrors RN's StyleSheet.flatten without importing react-native directly,
// since style props may be a single object or an array of objects.
function StyleSheetFlatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.map(StyleSheetFlatten));
  }
  return (style as Record<string, unknown>) ?? {};
}
