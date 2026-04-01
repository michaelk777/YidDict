import React from 'react';
import { View } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import SearchScreen from '../screens/SearchScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ExportScreen from '../screens/ExportScreen';
import SettingsScreen from '../screens/SettingsScreen';

const mockUseColorScheme = jest.fn(() => 'light' as 'light' | 'dark');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => mockUseColorScheme(),
}));

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

/** Returns the outermost View rendered by the screen component. */
function getContainerView() {
  return screen.UNSAFE_getAllByType(View)[0];
}

function flatStyle(styles: object[]): Record<string, unknown> {
  return Object.assign({}, ...styles);
}

describe('Screen stubs', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReturnValue('light');
  });

  describe('SearchScreen', () => {
    it('renders the "Search" label', () => {
      wrap(<SearchScreen />);
      expect(screen.getByText('Search')).toBeTruthy();
    });

    it('applies light theme background color to container', () => {
      wrap(<SearchScreen />);
      const flat = flatStyle(getContainerView().props.style);
      expect(flat.backgroundColor).toBe('#FFFFFF');
    });

    it('applies light theme text color to label', () => {
      wrap(<SearchScreen />);
      const flat = flatStyle(screen.getByText('Search').props.style);
      expect(flat.color).toBe('#1A1A1A');
    });

    it('switches to dark theme background when scheme is dark', () => {
      mockUseColorScheme.mockReturnValue('dark');
      wrap(<SearchScreen />);
      const flat = flatStyle(getContainerView().props.style);
      expect(flat.backgroundColor).toBe('#121212');
      expect(flat.backgroundColor).not.toBe('#FFFFFF');
    });

    it('switches to dark theme text color when scheme is dark', () => {
      mockUseColorScheme.mockReturnValue('dark');
      wrap(<SearchScreen />);
      const flat = flatStyle(screen.getByText('Search').props.style);
      expect(flat.color).toBe('#F0F0F0');
      expect(flat.color).not.toBe('#1A1A1A');
    });
  });

  describe('HistoryScreen', () => {
    it('renders the "History" label', () => {
      wrap(<HistoryScreen />);
      expect(screen.getByText('History')).toBeTruthy();
    });

    it('applies light theme background color', () => {
      wrap(<HistoryScreen />);
      const flat = flatStyle(getContainerView().props.style);
      expect(flat.backgroundColor).toBe('#FFFFFF');
    });

    it('applies light theme text color to label', () => {
      wrap(<HistoryScreen />);
      const flat = flatStyle(screen.getByText('History').props.style);
      expect(flat.color).toBe('#1A1A1A');
    });

    it('switches to dark theme background when scheme is dark', () => {
      mockUseColorScheme.mockReturnValue('dark');
      wrap(<HistoryScreen />);
      const flat = flatStyle(getContainerView().props.style);
      expect(flat.backgroundColor).toBe('#121212');
      expect(flat.backgroundColor).not.toBe('#FFFFFF');
    });

    it('switches to dark theme text color when scheme is dark', () => {
      mockUseColorScheme.mockReturnValue('dark');
      wrap(<HistoryScreen />);
      const flat = flatStyle(screen.getByText('History').props.style);
      expect(flat.color).toBe('#F0F0F0');
      expect(flat.color).not.toBe('#1A1A1A');
    });
  });

  describe('ExportScreen', () => {
    it('renders the "Export" label', () => {
      wrap(<ExportScreen />);
      expect(screen.getByText('Export')).toBeTruthy();
    });

    it('applies light theme background color', () => {
      wrap(<ExportScreen />);
      const flat = flatStyle(getContainerView().props.style);
      expect(flat.backgroundColor).toBe('#FFFFFF');
    });

    it('applies light theme text color to label', () => {
      wrap(<ExportScreen />);
      const flat = flatStyle(screen.getByText('Export').props.style);
      expect(flat.color).toBe('#1A1A1A');
    });

    it('switches to dark theme background when scheme is dark', () => {
      mockUseColorScheme.mockReturnValue('dark');
      wrap(<ExportScreen />);
      const flat = flatStyle(getContainerView().props.style);
      expect(flat.backgroundColor).toBe('#121212');
      expect(flat.backgroundColor).not.toBe('#FFFFFF');
    });

    it('switches to dark theme text color when scheme is dark', () => {
      mockUseColorScheme.mockReturnValue('dark');
      wrap(<ExportScreen />);
      const flat = flatStyle(screen.getByText('Export').props.style);
      expect(flat.color).toBe('#F0F0F0');
      expect(flat.color).not.toBe('#1A1A1A');
    });
  });

  describe('SettingsScreen', () => {
    it('renders the "Settings" label', () => {
      wrap(<SettingsScreen />);
      expect(screen.getByText('Settings')).toBeTruthy();
    });

    it('applies light theme background color', () => {
      wrap(<SettingsScreen />);
      const flat = flatStyle(getContainerView().props.style);
      expect(flat.backgroundColor).toBe('#FFFFFF');
    });

    it('applies light theme text color to label', () => {
      wrap(<SettingsScreen />);
      const flat = flatStyle(screen.getByText('Settings').props.style);
      expect(flat.color).toBe('#1A1A1A');
    });

    it('switches to dark theme background when scheme is dark', () => {
      mockUseColorScheme.mockReturnValue('dark');
      wrap(<SettingsScreen />);
      const flat = flatStyle(getContainerView().props.style);
      expect(flat.backgroundColor).toBe('#121212');
      expect(flat.backgroundColor).not.toBe('#FFFFFF');
    });

    it('switches to dark theme text color when scheme is dark', () => {
      mockUseColorScheme.mockReturnValue('dark');
      wrap(<SettingsScreen />);
      const flat = flatStyle(screen.getByText('Settings').props.style);
      expect(flat.color).toBe('#F0F0F0');
      expect(flat.color).not.toBe('#1A1A1A');
    });
  });
});
