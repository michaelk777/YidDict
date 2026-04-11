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

jest.mock('../db/settingsDb', () => ({
  getSourceOrder: jest.fn(),
  setSourceOrderSlot: jest.fn(),
  availableOptionsForSlot: jest.requireActual('../db/settingsDb').availableOptionsForSlot,
  SOURCE_LABELS: jest.requireActual('../db/settingsDb').SOURCE_LABELS,
}));

import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  login,
} from '../services/verterbukh-auth';

import { getSourceOrder, setSourceOrderSlot } from '../db/settingsDb';

const mockGetCredentials = getCredentials as jest.Mock;
const mockSaveCredentials = saveCredentials as jest.Mock;
const mockDeleteCredentials = deleteCredentials as jest.Mock;
const mockLogin = login as jest.Mock;
const mockGetSourceOrder = getSourceOrder as jest.Mock;
const mockSetSourceOrderSlot = setSourceOrderSlot as jest.Mock;

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
  mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'google_translate']);
  mockSetSourceOrderSlot.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Section headers
// ---------------------------------------------------------------------------

describe('SettingsScreen — section headers', () => {
  it('renders all section labels', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('SEARCH PREFERENCES')).toBeTruthy();
      expect(screen.getByText('VERTERBUKH LOGIN')).toBeTruthy();
      expect(screen.getByText('APPEARANCE')).toBeTruthy();
      expect(screen.getByText('LANGUAGE')).toBeTruthy();
      expect(screen.getByText('SECURITY')).toBeTruthy();
    });
  });

  it('shows "Coming soon" on the three remaining placeholder rows', async () => {
    renderScreen();
    await waitFor(() => {
      const comingSoon = screen.getAllByText(/Coming soon/);
      expect(comingSoon.length).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Search Preferences section
// ---------------------------------------------------------------------------

describe('SettingsScreen — Search Preferences', () => {
  it('renders all three source order rows with default values', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('source-order-row-1')).toBeTruthy();
      expect(screen.getByTestId('source-order-row-2')).toBeTruthy();
      expect(screen.getByTestId('source-order-row-3')).toBeTruthy();
    });
    expect(screen.getByText('Finkel')).toBeTruthy();
    expect(screen.getByText('Verterbukh')).toBeTruthy();
    expect(screen.getByText('Google Translate')).toBeTruthy();
  });

  it('shows "pay per result" only on the Verterbukh row', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-2'));
    const payLabels = screen.getAllByText(/pay per result/);
    expect(payLabels.length).toBe(1);
  });

  it('opens picker modal when a row is tapped', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-1'));
    fireEvent.press(screen.getByTestId('source-order-row-1'));
    await waitFor(() => {
      expect(screen.getByText('Position 1')).toBeTruthy();
    });
  });

  it('picker modal shows only sources not used in other slots', async () => {
    // Default order: slot 1=finkel, slot 2=verterbukh, slot 3=google_translate
    // Opening slot 2 picker: slot 1=finkel and slot 3=google_translate are taken,
    // so only verterbukh (own current value) and none should be offered.
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-2'));
    fireEvent.press(screen.getByTestId('source-order-row-2'));
    await waitFor(() => screen.getByText('Position 2'));
    expect(screen.queryByTestId('picker-option-finkel')).toBeNull();
    expect(screen.queryByTestId('picker-option-google_translate')).toBeNull();
    expect(screen.getByTestId('picker-option-verterbukh')).toBeTruthy();
    expect(screen.getByTestId('picker-option-none')).toBeTruthy();
  });

  it('does not offer "None" when all other slots are already none', async () => {
    // Only slot 1 has a real source; editing slot 1 — other slots are none,
    // so none must not be offered (would leave zero real sources).
    mockGetSourceOrder.mockResolvedValue(['finkel', 'none', 'none']);
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-1'));
    fireEvent.press(screen.getByTestId('source-order-row-1'));
    await waitFor(() => screen.getByText('Position 1'));
    expect(screen.queryByTestId('picker-option-none')).toBeNull();
  });

  it('calls setSourceOrderSlot and closes modal on selection', async () => {
    // Order: slot 1=finkel, slot 2=none, slot 3=none; logged in so Verterbukh is selectable.
    mockGetCredentials.mockResolvedValue({ username: 'testuser', password: 'testpass' });
    mockGetSourceOrder.mockResolvedValue(['finkel', 'none', 'none']);
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-2'));
    fireEvent.press(screen.getByTestId('source-order-row-2'));
    await waitFor(() => screen.getByTestId('picker-option-verterbukh'));
    fireEvent.press(screen.getByTestId('picker-option-verterbukh'));
    await waitFor(() => {
      expect(mockSetSourceOrderSlot).toHaveBeenCalledWith(2, 'verterbukh');
      expect(screen.queryByText('Position 2')).toBeNull();
    });
  });

  it('shows "pay per result" on Verterbukh option in the picker modal when logged in', async () => {
    mockGetCredentials.mockResolvedValue({ username: 'testuser', password: 'testpass' });
    mockGetSourceOrder.mockResolvedValue(['finkel', 'none', 'none']);
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-2'));
    fireEvent.press(screen.getByTestId('source-order-row-2'));
    await waitFor(() => screen.getByTestId('picker-option-verterbukh'));
    expect(screen.getByText('pay per result')).toBeTruthy();
  });

  it('shows "login required" on Verterbukh option when not logged in', async () => {
    // Default: mockGetCredentials returns null (not logged in)
    mockGetSourceOrder.mockResolvedValue(['finkel', 'none', 'none']);
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-2'));
    fireEvent.press(screen.getByTestId('source-order-row-2'));
    await waitFor(() => screen.getByTestId('picker-option-verterbukh'));
    expect(screen.getByText('login required')).toBeTruthy();
    expect(screen.queryByText('pay per result')).toBeNull();
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
