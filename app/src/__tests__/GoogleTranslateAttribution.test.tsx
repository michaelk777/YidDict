import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../context/ThemeContext';
import { GoogleTranslateAttribution } from '../components/GoogleTranslateAttribution';

const COLOR_LOGO = require('../../assets/google-translate/color-regular.png');
const WHITE_LOGO = require('../../assets/google-translate/white-regular.png');

function renderWithScheme(scheme: 'light' | 'dark') {
  return render(
    <ThemeProvider initialScheme={scheme}>
      <GoogleTranslateAttribution />
    </ThemeProvider>
  );
}

describe('GoogleTranslateAttribution', () => {
  it('renders the colored logo in light theme', () => {
    renderWithScheme('light');
    expect(screen.getByTestId('google-translate-attribution').props.source).toBe(COLOR_LOGO);
  });

  it('renders the white logo in dark theme', () => {
    renderWithScheme('dark');
    expect(screen.getByTestId('google-translate-attribution').props.source).toBe(WHITE_LOGO);
  });

  it('preserves the source aspect ratio (176:16) at a custom height', () => {
    render(
      <ThemeProvider initialScheme="light">
        <GoogleTranslateAttribution height={28} />
      </ThemeProvider>
    );
    const image = screen.getByTestId('google-translate-attribution');
    const flatStyle = Array.isArray(image.props.style) ? Object.assign({}, ...image.props.style) : image.props.style;
    expect(flatStyle.height).toBe(28);
    expect(flatStyle.width).toBe(28 * (176 / 16));
  });
});
