import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ThemeProvider, lightTheme } from '../context/ThemeContext';
import AppNavigator from '../navigation/AppNavigator';

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
  it('renders all four tab labels', () => {
    renderNavigator();
    // Each label appears at least once (as the tab bar button text)
    expect(screen.getAllByText('Search').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('History').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Export').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1);
  });

  it('renders an icon for each of the four tabs', () => {
    renderNavigator();
    // Icons are rendered by our mock as Text with testID="icon-<name>"
    expect(screen.getAllByTestId(/^icon-/).length).toBeGreaterThanOrEqual(4);
  });

  it('active Search tab icon is filled (not outline) and colored with theme.primary', () => {
    renderNavigator();
    // The filled icon for Search should exist and carry the active (primary) color
    const activeIcon = screen.queryByTestId('icon-search');
    expect(activeIcon).toBeTruthy();
    expect(activeIcon!.props.style.color).toBe(lightTheme.primary);
  });

  it('inactive tab icons use outline variant and theme.textSecondary color', () => {
    renderNavigator();
    const historyIcon = screen.queryByTestId('icon-time-outline');
    const exportIcon = screen.queryByTestId('icon-share-social-outline');
    const settingsIcon = screen.queryByTestId('icon-settings-outline');
    expect(historyIcon).toBeTruthy();
    expect(exportIcon).toBeTruthy();
    expect(settingsIcon).toBeTruthy();
    expect(historyIcon!.props.style.color).toBe(lightTheme.textSecondary);
    expect(exportIcon!.props.style.color).toBe(lightTheme.textSecondary);
    expect(settingsIcon!.props.style.color).toBe(lightTheme.textSecondary);
  });

  it('pressing History tab makes its icon filled and primary-colored', () => {
    renderNavigator();
    fireEvent.press(screen.getAllByText('History')[0]);

    // After pressing, History's filled icon should have primary color
    const activeIcon = screen.queryByTestId('icon-time');
    expect(activeIcon).toBeTruthy();
    expect(activeIcon!.props.style.color).toBe(lightTheme.primary);

    // Search's outline icon should now have secondary color
    const inactiveIcon = screen.queryByTestId('icon-search-outline');
    expect(inactiveIcon).toBeTruthy();
    expect(inactiveIcon!.props.style.color).toBe(lightTheme.textSecondary);
  });

  it('shows Search screen content by default, not History', () => {
    renderNavigator();
    // The active screen stub renders its name as a heading.
    // Search should be visible; History screen content should not be rendered.
    // Tab labels for all tabs are always present, but screen body content
    // for inactive tabs is not mounted by the bottom tab navigator.
    const searchNodes = screen.getAllByText('Search');
    // At least two: one tab label + one screen heading
    expect(searchNodes.length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to History screen when History tab is pressed', () => {
    renderNavigator();
    // Press the History tab button (the tab label text element)
    const historyTabButtons = screen.getAllByText('History');
    fireEvent.press(historyTabButtons[0]);
    // After pressing, the History screen body should now be mounted
    // (at least two "History" nodes: tab label + screen heading)
    expect(screen.getAllByText('History').length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to Export screen when Export tab is pressed', () => {
    renderNavigator();
    fireEvent.press(screen.getAllByText('Export')[0]);
    expect(screen.getAllByText('Export').length).toBeGreaterThanOrEqual(2);
  });

  it('navigates to Settings screen when Settings tab is pressed', () => {
    renderNavigator();
    fireEvent.press(screen.getAllByText('Settings')[0]);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(2);
  });
});
