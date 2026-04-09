import React from 'react';
import { ActivityIndicator } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { lightTheme } from '../context/ThemeContext';

// Mock SafeAreaProvider — its native component renders no children in the test environment
jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: unknown }) =>
      mockReact.createElement(View, { testID: 'safe-area-provider' }, children),
    SafeAreaView: ({ children }: { children: unknown }) =>
      mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

// Mock AppNavigator — App.test focuses on init behavior, not the nav stack
jest.mock('../navigation/AppNavigator', () => {
  const mockReact = require('react');
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => mockReact.createElement(Text, { testID: 'app-navigator' }, 'Navigator'),
  };
});

jest.mock('expo-sqlite');
jest.mock('../db/database', () => ({
  initDatabase: jest.fn(),
}));

import { initDatabase } from '../db/database';
import App from '../../App';

const mockInitDatabase = initDatabase as jest.Mock;

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a loading spinner while the database is initializing', () => {
    mockInitDatabase.mockReturnValue(new Promise(() => {})); // never resolves
    render(<App />);
    expect(screen.UNSAFE_getAllByType(ActivityIndicator).length).toBeGreaterThan(0);
  });

  it('loading view background uses theme.background (light = #FFFFFF)', () => {
    mockInitDatabase.mockReturnValue(new Promise(() => {}));
    const { View } = require('react-native');
    render(<App />);
    const views = screen.UNSAFE_getAllByType(View);
    // The loading container is the View that wraps the ActivityIndicator
    const spinner = screen.UNSAFE_getAllByType(ActivityIndicator)[0];
    const loadingView = spinner.parent;
    const styles: object[] = loadingView?.props?.style ?? [];
    const flat = Object.assign({}, ...styles);
    expect(flat.backgroundColor).toBe('#FFFFFF');
  });

  it('loading spinner color uses theme.primary', () => {
    mockInitDatabase.mockReturnValue(new Promise(() => {}));
    render(<App />);
    const spinner = screen.UNSAFE_getAllByType(ActivityIndicator)[0];
    expect(spinner.props.color).toBe(lightTheme.primary);
  });

  it('hides the spinner and shows the navigator after DB initializes', async () => {
    mockInitDatabase.mockResolvedValue(undefined);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('app-navigator')).toBeTruthy();
    });
    expect(screen.UNSAFE_queryAllByType(ActivityIndicator)).toHaveLength(0);
  });

  it('calls initDatabase exactly once on mount', async () => {
    mockInitDatabase.mockResolvedValue(undefined);
    render(<App />);
    await waitFor(() => expect(mockInitDatabase).toHaveBeenCalledTimes(1));
  });

  it('logs the error and stays on the loading screen if initDatabase rejects', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockInitDatabase.mockRejectedValue(new Error('DB init failed'));
    render(<App />);
    // Wait for the rejection to be caught and logged
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // The app should still be showing the spinner — dbReady never became true
    expect(screen.UNSAFE_getAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('app-navigator')).toBeNull();
    spy.mockRestore();
  });
});
