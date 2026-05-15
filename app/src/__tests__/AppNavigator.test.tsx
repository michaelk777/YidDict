import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, lightTheme } from '../context/ThemeContext';
import AppNavigator from '../navigation/AppNavigator';

jest.mock('../db/savedDb', () => ({
  getSavedEntries: jest.fn().mockResolvedValue([]),
  deleteEntry: jest.fn().mockResolvedValue(undefined),
  clearSaved: jest.fn().mockResolvedValue(undefined),
  generateCsv: jest.fn().mockReturnValue(''),
  generateTsv: jest.fn().mockReturnValue(''),
}));

jest.mock('../context/SavedContext', () => ({
  SavedProvider: ({ children }: { children: React.ReactNode }) => children,
  useSaved: jest.fn(() => ({
    savedEntries: [],
    savedKeySet: new Set(),
    isLoading: false,
    refreshSaved: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('expo-file-system/legacy');
jest.mock('expo-sharing');

function renderNavigator() {
  return render(
    <ThemeProvider>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </ThemeProvider>
  );
}

describe('AppNavigator', () => {
  it('renders all three tab labels', () => {
    renderNavigator();
    expect(screen.getAllByText('Search').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Saved').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1);
  });

  it('renders an icon for each of the three tabs', () => {
    renderNavigator();
    expect(screen.getAllByTestId(/^icon-/).length).toBeGreaterThanOrEqual(3);
  });

  it('active Search tab icon is filled and colored with theme.primary', () => {
    renderNavigator();
    const activeIcon = screen.queryByTestId('icon-search');
    expect(activeIcon).toBeTruthy();
    expect(activeIcon!.props.style.color).toBe(lightTheme.primary);
  });

  it('inactive tab icons use outline variant and theme.textSecondary color', () => {
    renderNavigator();
    const savedIcon = screen.queryByTestId('icon-bookmark-outline');
    const settingsIcon = screen.queryByTestId('icon-settings-outline');
    expect(savedIcon).toBeTruthy();
    expect(settingsIcon).toBeTruthy();
    expect(savedIcon!.props.style.color).toBe(lightTheme.textSecondary);
    expect(settingsIcon!.props.style.color).toBe(lightTheme.textSecondary);
  });

  it('pressing Saved tab makes its icon filled and primary-colored', () => {
    renderNavigator();
    fireEvent.press(screen.getAllByText('Saved')[0]);

    const activeIcon = screen.queryByTestId('icon-bookmark');
    expect(activeIcon).toBeTruthy();
    expect(activeIcon!.props.style.color).toBe(lightTheme.primary);

    const inactiveIcon = screen.queryByTestId('icon-search-outline');
    expect(inactiveIcon).toBeTruthy();
    expect(inactiveIcon!.props.style.color).toBe(lightTheme.textSecondary);
  });

  it('shows Search screen content by default', () => {
    renderNavigator();
    const searchNodes = screen.getAllByText('Search');
    expect(searchNodes.length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to Saved screen when Saved tab is pressed', async () => {
    renderNavigator();
    fireEvent.press(screen.getAllByText('Saved')[0]);
    expect(await screen.findByTestId('saved-root')).toBeTruthy();
  });

  it('navigates to Settings screen when Settings tab is pressed', () => {
    renderNavigator();
    fireEvent.press(screen.getAllByText('Settings')[0]);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(2);
  });
});
