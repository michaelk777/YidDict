// SearchScreen is tested in SearchScreen.test.tsx
// SettingsScreen is tested in SettingsScreen.test.tsx
// SavedScreen is tested in SavedScreen.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../context/ThemeContext';
import SavedScreen from '../screens/SavedScreen';

const mockUseColorScheme = jest.fn(() => 'light' as 'light' | 'dark');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => mockUseColorScheme(),
}));

jest.mock('../db/savedDb', () => ({
  getSavedEntries: jest.fn().mockResolvedValue([]),
  deleteEntry: jest.fn().mockResolvedValue(undefined),
  clearSaved: jest.fn().mockResolvedValue(undefined),
  generateCsv: jest.fn().mockReturnValue(''),
  generateTsv: jest.fn().mockReturnValue(''),
}));

jest.mock('../context/SavedContext', () => ({
  useSaved: jest.fn(() => ({
    savedEntries: [],
    savedKeySet: new Set(),
    isLoading: false,
    refreshSaved: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('expo-file-system/legacy');
jest.mock('expo-sharing');

function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('SavedScreen', () => {
  beforeEach(() => {
    mockUseColorScheme.mockReturnValue('light');
  });

  it('renders the saved-root container', async () => {
    wrap(<SavedScreen />);
    expect(await screen.findByTestId('saved-root')).toBeTruthy();
  });

  it('shows the empty state when there are no saved entries', async () => {
    wrap(<SavedScreen />);
    expect(await screen.findByTestId('empty-state')).toBeTruthy();
  });
});
