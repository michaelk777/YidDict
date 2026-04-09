import React from 'react';
import { Text } from 'react-native';
import { render, act, screen } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

// Controlled mock for useColorScheme so we can test system mode
const mockUseColorScheme = jest.fn(() => 'light' as 'light' | 'dark');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => mockUseColorScheme(),
}));

function ThemeConsumer() {
  const { theme, colorScheme, schemeOverride, toggleColorScheme, setColorScheme } = useTheme();
  return (
    <>
      <Text testID="colorScheme">{colorScheme}</Text>
      <Text testID="override">{schemeOverride}</Text>
      <Text testID="bg">{theme.background}</Text>
      <Text testID="toggle" onPress={toggleColorScheme}>toggle</Text>
      <Text testID="setLight" onPress={() => setColorScheme('light')}>setLight</Text>
      <Text testID="setDark" onPress={() => setColorScheme('dark')}>setDark</Text>
      <Text testID="setSystem" onPress={() => setColorScheme('system')}>setSystem</Text>
    </>
  );
}

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReturnValue('light');
  });

  it('defaults to system mode and reflects the device light scheme', () => {
    renderWithTheme();
    expect(screen.getByTestId('override').props.children).toBe('system');
    expect(screen.getByTestId('colorScheme').props.children).toBe('light');
    expect(screen.getByTestId('bg').props.children).toBe('#FFFFFF');
  });

  it('reflects dark scheme when device is dark and override is system', () => {
    mockUseColorScheme.mockReturnValue('dark');
    renderWithTheme();
    expect(screen.getByTestId('colorScheme').props.children).toBe('dark');
    expect(screen.getByTestId('bg').props.children).toBe('#121212');
  });

  it('setColorScheme("light") forces light regardless of system', () => {
    mockUseColorScheme.mockReturnValue('dark');
    renderWithTheme();
    act(() => screen.getByTestId('setLight').props.onPress());
    expect(screen.getByTestId('colorScheme').props.children).toBe('light');
    expect(screen.getByTestId('override').props.children).toBe('light');
    expect(screen.getByTestId('bg').props.children).toBe('#FFFFFF');
  });

  it('setColorScheme("dark") forces dark regardless of system', () => {
    mockUseColorScheme.mockReturnValue('light');
    renderWithTheme();
    act(() => screen.getByTestId('setDark').props.onPress());
    expect(screen.getByTestId('colorScheme').props.children).toBe('dark');
    expect(screen.getByTestId('override').props.children).toBe('dark');
    expect(screen.getByTestId('bg').props.children).toBe('#121212');
  });

  it('setColorScheme("system") restores system following', () => {
    mockUseColorScheme.mockReturnValue('dark');
    renderWithTheme();
    act(() => screen.getByTestId('setLight').props.onPress());
    act(() => screen.getByTestId('setSystem').props.onPress());
    expect(screen.getByTestId('override').props.children).toBe('system');
    expect(screen.getByTestId('colorScheme').props.children).toBe('dark');
  });

  describe('toggleColorScheme', () => {
    it('from system/light: sets override to dark', () => {
      mockUseColorScheme.mockReturnValue('light');
      renderWithTheme();
      act(() => screen.getByTestId('toggle').props.onPress());
      expect(screen.getByTestId('colorScheme').props.children).toBe('dark');
      expect(screen.getByTestId('override').props.children).toBe('dark');
    });

    it('from system/dark: sets override to light', () => {
      mockUseColorScheme.mockReturnValue('dark');
      renderWithTheme();
      act(() => screen.getByTestId('toggle').props.onPress());
      expect(screen.getByTestId('colorScheme').props.children).toBe('light');
      expect(screen.getByTestId('override').props.children).toBe('light');
    });

    it('from explicit light: toggles to dark', () => {
      renderWithTheme();
      act(() => screen.getByTestId('setLight').props.onPress());
      act(() => screen.getByTestId('toggle').props.onPress());
      expect(screen.getByTestId('colorScheme').props.children).toBe('dark');
    });

    it('from explicit dark: toggles to light', () => {
      renderWithTheme();
      act(() => screen.getByTestId('setDark').props.onPress());
      act(() => screen.getByTestId('toggle').props.onPress());
      expect(screen.getByTestId('colorScheme').props.children).toBe('light');
    });
  });

  it('useTheme throws when used outside ThemeProvider', () => {
    function Bare() {
      useTheme();
      return null;
    }
    // Suppress the expected error boundary noise
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrow('useTheme must be used within ThemeProvider');
    spy.mockRestore();
  });

  it('light theme exposes all color tokens with correct values', () => {
    function FullConsumer() {
      const { theme } = useTheme();
      return (
        <>
          <Text testID="t-background">{theme.background}</Text>
          <Text testID="t-surface">{theme.surface}</Text>
          <Text testID="t-text">{theme.text}</Text>
          <Text testID="t-textSecondary">{theme.textSecondary}</Text>
          <Text testID="t-primary">{theme.primary}</Text>
          <Text testID="t-border">{theme.border}</Text>
          <Text testID="t-sourceFinkel">{theme.sourceFinkel}</Text>
          <Text testID="t-sourceVerterbukh">{theme.sourceVerterbukh}</Text>
          <Text testID="t-sourceGoogle">{theme.sourceGoogle}</Text>
        </>
      );
    }
    render(<ThemeProvider><FullConsumer /></ThemeProvider>);
    expect(screen.getByTestId('t-background').props.children).toBe('#FFFFFF');
    expect(screen.getByTestId('t-surface').props.children).toBe('#F5F5F5');
    expect(screen.getByTestId('t-text').props.children).toBe('#1A1A1A');
    expect(screen.getByTestId('t-textSecondary').props.children).toBe('#6B6B6B');
    expect(screen.getByTestId('t-primary').props.children).toBe('#0D9488');
    expect(screen.getByTestId('t-border').props.children).toBe('#E0E0E0');
    expect(screen.getByTestId('t-sourceFinkel').props.children).toBe('#2563EB');
    expect(screen.getByTestId('t-sourceVerterbukh').props.children).toBe('#DC2626');
    expect(screen.getByTestId('t-sourceGoogle').props.children).toBe('#16A34A');
  });

  it('dark theme exposes all color tokens with correct values', () => {
    mockUseColorScheme.mockReturnValue('dark');
    function FullConsumer() {
      const { theme } = useTheme();
      return (
        <>
          <Text testID="t-background">{theme.background}</Text>
          <Text testID="t-surface">{theme.surface}</Text>
          <Text testID="t-text">{theme.text}</Text>
          <Text testID="t-textSecondary">{theme.textSecondary}</Text>
          <Text testID="t-primary">{theme.primary}</Text>
          <Text testID="t-border">{theme.border}</Text>
          <Text testID="t-sourceFinkel">{theme.sourceFinkel}</Text>
          <Text testID="t-sourceVerterbukh">{theme.sourceVerterbukh}</Text>
          <Text testID="t-sourceGoogle">{theme.sourceGoogle}</Text>
        </>
      );
    }
    render(<ThemeProvider><FullConsumer /></ThemeProvider>);
    expect(screen.getByTestId('t-background').props.children).toBe('#121212');
    expect(screen.getByTestId('t-surface').props.children).toBe('#1E1E1E');
    expect(screen.getByTestId('t-text').props.children).toBe('#F0F0F0');
    expect(screen.getByTestId('t-textSecondary').props.children).toBe('#A0A0A0');
    expect(screen.getByTestId('t-primary').props.children).toBe('#2DD4BF');
    expect(screen.getByTestId('t-border').props.children).toBe('#2E2E2E');
    expect(screen.getByTestId('t-sourceFinkel').props.children).toBe('#60A5FA');
    expect(screen.getByTestId('t-sourceVerterbukh').props.children).toBe('#F87171');
    expect(screen.getByTestId('t-sourceGoogle').props.children).toBe('#4ADE80');
  });
});
