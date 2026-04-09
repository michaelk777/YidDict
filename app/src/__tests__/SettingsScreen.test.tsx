/**
 * SettingsScreen.test.tsx
 *
 * Tests for the Settings screen: Verterbukh login/logout flow, credential
 * persistence, status messaging, and placeholder section rendering.
 * verterbukh-auth and expo-secure-store are mocked.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../context/ThemeContext';
import SettingsScreen from '../screens/SettingsScreen';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseColorScheme = jest.fn(() => 'light' as 'light' | 'dark');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => mockUseColorScheme(),
}));

jest.mock('../services/verterbukh-auth', () => ({
  getCredentials: jest.fn(),
  saveCredentials: jest.fn(),
  deleteCredentials: jest.fn(),
  login: jest.fn(),
}));

import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  login,
} from '../services/verterbukh-auth';

const mockGetCredentials = getCredentials as jest.Mock;
const mockSaveCredentials = saveCredentials as jest.Mock;
const mockDeleteCredentials = deleteCredentials as jest.Mock;
const mockLogin = login as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderScreen() {
  return render(
    <ThemeProvider>
      <SettingsScreen />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCredentials.mockResolvedValue(null);
  mockSaveCredentials.mockResolvedValue(undefined);
  mockDeleteCredentials.mockResolvedValue(undefined);
  mockLogin.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Placeholder sections
// ---------------------------------------------------------------------------

describe('SettingsScreen — placeholder sections', () => {
  it('renders all placeholder section labels', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Search Preferences')).toBeTruthy();
      expect(screen.getByText('Appearance')).toBeTruthy();
      expect(screen.getByText('Language')).toBeTruthy();
      expect(screen.getByText('Security')).toBeTruthy();
    });
  });

  it('shows "Coming soon" on each placeholder row', async () => {
    renderScreen();
    await waitFor(() => {
      const comingSoon = screen.getAllByText(/Coming soon/);
      expect(comingSoon.length).toBe(4);
    });
  });
});

// ---------------------------------------------------------------------------
// Verterbukh login — logged out state
// ---------------------------------------------------------------------------

describe('SettingsScreen — logged out', () => {
  it('shows username and password inputs when no credentials are saved', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('username-input')).toBeTruthy();
      expect(screen.getByTestId('password-input')).toBeTruthy();
    });
  });

  it('shows the Login button when logged out', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('login-button')).toBeTruthy();
    });
  });

  it('does not show the Logout button when logged out', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.queryByTestId('logout-button')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Verterbukh login — logged in state
// ---------------------------------------------------------------------------

describe('SettingsScreen — logged in', () => {
  beforeEach(() => {
    mockGetCredentials.mockResolvedValue({ username: 'testuser', password: 'testpass' });
  });

  it('shows the logged-in username', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('logged-in-status')).toBeTruthy();
      expect(screen.getByText(/testuser/)).toBeTruthy();
    });
  });

  it('shows the Logout button when logged in', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('logout-button')).toBeTruthy();
    });
  });

  it('does not show credential inputs when logged in', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.queryByTestId('username-input')).toBeNull();
      expect(screen.queryByTestId('password-input')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

describe('SettingsScreen — login flow', () => {
  it('calls login and saveCredentials with entered credentials', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('username-input'));

    fireEvent.changeText(screen.getByTestId('username-input'), 'testuser');
    fireEvent.changeText(screen.getByTestId('password-input'), 'testpass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'testuser', password: 'testpass' });
      expect(mockSaveCredentials).toHaveBeenCalledWith({ username: 'testuser', password: 'testpass' });
    });
  });

  it('switches to logged-in state on success with no status message', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('username-input'));

    fireEvent.changeText(screen.getByTestId('username-input'), 'testuser');
    fireEvent.changeText(screen.getByTestId('password-input'), 'testpass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByTestId('logout-button')).toBeTruthy();
      expect(screen.queryByTestId('status-message')).toBeNull();
    });
  });

  it('shows error message when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Login failed'));
    renderScreen();
    await waitFor(() => screen.getByTestId('username-input'));

    fireEvent.changeText(screen.getByTestId('username-input'), 'testuser');
    fireEvent.changeText(screen.getByTestId('password-input'), 'wrongpass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toBeTruthy();
      expect(screen.getByText(/Login failed/)).toBeTruthy();
    });
  });

  it('shows an error if Login is pressed with empty fields', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('login-button'));
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByText(/Please enter both/)).toBeTruthy();
    });
    expect(mockLogin).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Logout flow
// ---------------------------------------------------------------------------

describe('SettingsScreen — logout flow', () => {
  beforeEach(() => {
    mockGetCredentials.mockResolvedValue({ username: 'testuser', password: 'testpass' });
  });

  it('calls deleteCredentials and returns to logged-out state', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('logout-button'));

    fireEvent.press(screen.getByTestId('logout-button'));

    await waitFor(() => {
      expect(mockDeleteCredentials).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('login-button')).toBeTruthy();
      expect(screen.queryByTestId('logout-button')).toBeNull();
    });
  });
});
