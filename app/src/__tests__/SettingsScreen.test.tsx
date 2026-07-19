/**
 * SettingsScreen.test.tsx
 *
 * Tests for the Settings screen: Verterbukh login/logout flow, credential
 * persistence, status messaging, and placeholder section rendering.
 * verterbukh-auth and expo-secure-store are mocked.
 */

import React from 'react';
import { Alert } from 'react-native';
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

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { cb(); },
}));

jest.mock('../db/cacheDb', () => ({
  clearCache: jest.fn(),
  purgeExpiredCache: jest.fn(),
  countExpiringCache: jest.fn(),
}));

jest.mock('../db/savedDb', () => ({
  getSavedEntriesCount: jest.fn(),
  trimSaved: jest.fn(),
}));

jest.mock('../context/SavedContext', () => ({
  useSaved: jest.fn(),
}));

jest.mock('../services/verterbukh-auth', () => ({
  getCredentials: jest.fn(),
  saveCredentials: jest.fn(),
  deleteCredentials: jest.fn(),
  setInMemoryCredentials: jest.fn(),
  login: jest.fn(),
  logout: jest.fn(),
  startSession: jest.fn(),
  hasActiveSession: jest.fn(),
}));

jest.mock('../db/settingsDb', () => ({
  getSourceOrder: jest.fn(),
  setSourceOrderSlot: jest.fn(),
  availableOptionsForSlot: jest.requireActual('../db/settingsDb').availableOptionsForSlot,
  SOURCE_LABELS: jest.requireActual('../db/settingsDb').SOURCE_LABELS,
  getMaxSavedEntries: jest.fn(),
  setMaxSavedEntries: jest.fn(),
  getLowTokenThreshold: jest.fn(),
  setLowTokenThreshold: jest.fn(),
  getCacheTtlDays: jest.fn(),
  setCacheTtlDays: jest.fn(),
  setThemePreference: jest.fn(),
  getUseAllSources: jest.fn(),
  setUseAllSources: jest.fn(),
  getYivoToHebrew: jest.fn(),
  setYivoToHebrew: jest.fn(),
  getYivoToHebrewWarned: jest.fn(),
  setYivoToHebrewWarned: jest.fn(),
  getHebrewToYivo: jest.fn(),
  setHebrewToYivo: jest.fn(),
  getHebrewToYivoWarned: jest.fn(),
  setHebrewToYivoWarned: jest.fn(),
  getVerterbukhQuota: jest.fn(),
  saveVerterbukhQuota: jest.fn(),
  clearVerterbukhQuota: jest.fn(),
  getVerterbukhKeepLoggedIn: jest.fn(),
  setVerterbukhKeepLoggedIn: jest.fn(),
  getVerterbukhExhaustedAlert: jest.fn(),
  setVerterbukhExhaustedAlert: jest.fn(),
  getVerterbukhLowTokenAlert: jest.fn(),
  setVerterbukhLowTokenAlert: jest.fn(),
  getSaveTrimAlert: jest.fn(),
  setSaveTrimAlert: jest.fn(),
}));

import { clearCache, purgeExpiredCache, countExpiringCache } from '../db/cacheDb';
import { getSavedEntriesCount, trimSaved } from '../db/savedDb';
import { useSaved } from '../context/SavedContext';

import {
  getCredentials,
  saveCredentials,
  deleteCredentials,
  setInMemoryCredentials,
  login,
  logout,
  startSession,
  hasActiveSession,
} from '../services/verterbukh-auth';

import {
  getSourceOrder,
  setSourceOrderSlot,
  getMaxSavedEntries,
  setMaxSavedEntries,
  getLowTokenThreshold,
  setLowTokenThreshold,
  getCacheTtlDays,
  setCacheTtlDays,
  setThemePreference,
  getUseAllSources,
  setUseAllSources,
  getYivoToHebrew,
  setYivoToHebrew,
  getYivoToHebrewWarned,
  setYivoToHebrewWarned,
  getHebrewToYivo,
  setHebrewToYivo,
  getHebrewToYivoWarned,
  setHebrewToYivoWarned,
  getVerterbukhQuota,
  saveVerterbukhQuota,
  clearVerterbukhQuota,
  getVerterbukhKeepLoggedIn,
  setVerterbukhKeepLoggedIn,
  getVerterbukhExhaustedAlert,
  setVerterbukhExhaustedAlert,
  getVerterbukhLowTokenAlert,
  setVerterbukhLowTokenAlert,
  getSaveTrimAlert,
  setSaveTrimAlert,
} from '../db/settingsDb';

const mockGetCredentials = getCredentials as jest.Mock;
const mockSaveCredentials = saveCredentials as jest.Mock;
const mockLogout = logout as jest.Mock;
const mockLogin = login as jest.Mock;
const mockGetSourceOrder = getSourceOrder as jest.Mock;
const mockSetSourceOrderSlot = setSourceOrderSlot as jest.Mock;
const mockGetMaxSavedEntries = getMaxSavedEntries as jest.Mock;
const mockSetMaxSavedEntries = setMaxSavedEntries as jest.Mock;
const mockGetLowTokenThreshold = getLowTokenThreshold as jest.Mock;
const mockSetLowTokenThreshold = setLowTokenThreshold as jest.Mock;
const mockGetCacheTtlDays = getCacheTtlDays as jest.Mock;
const mockSetCacheTtlDays = setCacheTtlDays as jest.Mock;
const mockPurgeExpiredCache = purgeExpiredCache as jest.Mock;
const mockCountExpiringCache = countExpiringCache as jest.Mock;
const mockGetSavedEntriesCount = getSavedEntriesCount as jest.Mock;
const mockTrimSaved = trimSaved as jest.Mock;
const mockUseSaved = useSaved as jest.Mock;
const mockRefreshSaved = jest.fn().mockResolvedValue(undefined);
const mockSetThemePreference = setThemePreference as jest.Mock;
const mockGetVerterbukhExhaustedAlert = getVerterbukhExhaustedAlert as jest.Mock;
const mockSetVerterbukhExhaustedAlert = setVerterbukhExhaustedAlert as jest.Mock;
const mockGetVerterbukhLowTokenAlert = getVerterbukhLowTokenAlert as jest.Mock;
const mockSetVerterbukhLowTokenAlert = setVerterbukhLowTokenAlert as jest.Mock;
const mockGetSaveTrimAlert = getSaveTrimAlert as jest.Mock;
const mockSetSaveTrimAlert = setSaveTrimAlert as jest.Mock;
const mockClearVerterbukhQuota = clearVerterbukhQuota as jest.Mock;
const mockSaveVerterbukhQuota = saveVerterbukhQuota as jest.Mock;

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
  (deleteCredentials as jest.Mock).mockResolvedValue(undefined);
  (setInMemoryCredentials as jest.Mock).mockImplementation(() => {});
  mockLogout.mockResolvedValue(undefined);
  mockLogin.mockResolvedValue(undefined);
  (startSession as jest.Mock).mockImplementation(() => {});
  (hasActiveSession as jest.Mock).mockReturnValue(true);
  (getVerterbukhKeepLoggedIn as jest.Mock).mockResolvedValue(false);
  (setVerterbukhKeepLoggedIn as jest.Mock).mockResolvedValue(undefined);
  mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'google_translate']);
  mockSetSourceOrderSlot.mockResolvedValue(undefined);
  mockGetMaxSavedEntries.mockResolvedValue(500);
  mockSetMaxSavedEntries.mockResolvedValue(undefined);
  mockGetLowTokenThreshold.mockResolvedValue(90);
  mockSetLowTokenThreshold.mockResolvedValue(undefined);
  mockGetCacheTtlDays.mockResolvedValue(90);
  mockSetCacheTtlDays.mockResolvedValue(undefined);
  mockSetThemePreference.mockResolvedValue(undefined);
  (getUseAllSources as jest.Mock).mockResolvedValue(false);
  (setUseAllSources as jest.Mock).mockResolvedValue(undefined);
  (getYivoToHebrew as jest.Mock).mockResolvedValue(false);
  (setYivoToHebrew as jest.Mock).mockResolvedValue(undefined);
  (getYivoToHebrewWarned as jest.Mock).mockResolvedValue(false);
  (setYivoToHebrewWarned as jest.Mock).mockResolvedValue(undefined);
  (getHebrewToYivo as jest.Mock).mockResolvedValue(false);
  (setHebrewToYivo as jest.Mock).mockResolvedValue(undefined);
  (getHebrewToYivoWarned as jest.Mock).mockResolvedValue(false);
  (setHebrewToYivoWarned as jest.Mock).mockResolvedValue(undefined);
  (clearCache as jest.Mock).mockResolvedValue(undefined);
  mockPurgeExpiredCache.mockResolvedValue(undefined);
  mockCountExpiringCache.mockResolvedValue(0);
  mockGetSavedEntriesCount.mockResolvedValue(0);
  mockTrimSaved.mockResolvedValue(undefined);
  mockUseSaved.mockReturnValue({ refreshSaved: mockRefreshSaved });
  (getVerterbukhQuota as jest.Mock).mockResolvedValue(null);
  mockGetVerterbukhExhaustedAlert.mockResolvedValue(false);
  mockSetVerterbukhExhaustedAlert.mockResolvedValue(undefined);
  mockGetVerterbukhLowTokenAlert.mockResolvedValue(true);
  mockSetVerterbukhLowTokenAlert.mockResolvedValue(undefined);
  mockGetSaveTrimAlert.mockResolvedValue(true);
  mockSetSaveTrimAlert.mockResolvedValue(undefined);
  mockClearVerterbukhQuota.mockResolvedValue(undefined);
  mockSaveVerterbukhQuota.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Section headers
// ---------------------------------------------------------------------------

describe('SettingsScreen — section headers', () => {
  it('renders all section labels', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('SEARCH SOURCE ORDER')).toBeTruthy();
      expect(screen.getByText('SAVED ENTRIES')).toBeTruthy();
      expect(screen.getByText('VERTERBUKH SETTINGS')).toBeTruthy();
      expect(screen.getByText('APPEARANCE')).toBeTruthy();
      expect(screen.getByText('ABOUT')).toBeTruthy();
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

  it('shows "Log in to access" only on the Verterbukh row when not logged in', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-2'));
    const loginLabels = screen.getAllByText(/Log in to access/);
    expect(loginLabels.length).toBe(1);
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

  it('shows no sub-label on Verterbukh option in the picker modal when logged in and no quota loaded', async () => {
    mockGetCredentials.mockResolvedValue({ username: 'testuser', password: 'testpass' });
    mockGetSourceOrder.mockResolvedValue(['finkel', 'none', 'none']);
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-2'));
    fireEvent.press(screen.getByTestId('source-order-row-2'));
    await waitFor(() => screen.getByTestId('picker-option-verterbukh'));
    expect(screen.queryByText('pay per result')).toBeNull();
    expect(screen.queryByText('Log in to access')).toBeNull();
  });

  it('shows quota in picker modal when logged in and quota is available', async () => {
    mockGetCredentials.mockResolvedValue({ username: 'testuser', password: 'testpass' });
    mockGetSourceOrder.mockResolvedValue(['finkel', 'none', 'none']);
    (getVerterbukhQuota as jest.Mock).mockResolvedValue({ used: 5, total: 100 });
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-2'));
    fireEvent.press(screen.getByTestId('source-order-row-2'));
    await waitFor(() => screen.getByTestId('picker-option-verterbukh'));
    expect(screen.getByText('pay per result · 5/100 tokens')).toBeTruthy();
  });

  it('shows "Log in to access" on Verterbukh option when not logged in', async () => {
    // Default: mockGetCredentials returns null (not logged in)
    mockGetSourceOrder.mockResolvedValue(['finkel', 'none', 'none']);
    renderScreen();
    await waitFor(() => screen.getByTestId('source-order-row-2'));
    fireEvent.press(screen.getByTestId('source-order-row-2'));
    await waitFor(() => screen.getByTestId('picker-option-verterbukh'));
    expect(screen.getByText('Log in to access')).toBeTruthy();
    expect(screen.queryByText('pay per result')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Numeric settings
// ---------------------------------------------------------------------------

describe('SettingsScreen — numeric settings', () => {
  it('shows the loaded max saved entries value', async () => {
    mockGetMaxSavedEntries.mockResolvedValue(750);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('max-saved-entries-input').props.value).toBe('750');
    });
  });

  it('shows the loaded low-token threshold value', async () => {
    mockGetLowTokenThreshold.mockResolvedValue(75);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('low-token-threshold-input').props.value).toBe('75');
    });
  });

  it('saves max saved entries on blur with a valid value', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('max-saved-entries-input'));
    fireEvent.changeText(screen.getByTestId('max-saved-entries-input'), '800');
    fireEvent(screen.getByTestId('max-saved-entries-input'), 'blur');
    await waitFor(() => {
      expect(mockSetMaxSavedEntries).toHaveBeenCalledWith(800);
    });
    expect(mockTrimSaved).toHaveBeenCalledWith(800);
    expect(mockRefreshSaved).toHaveBeenCalled();
  });

  it('does not show a confirmation alert when lowering the max below the current saved count', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockGetSavedEntriesCount.mockResolvedValue(50);
    renderScreen();
    await waitFor(() => screen.getByTestId('max-saved-entries-input'));
    fireEvent.changeText(screen.getByTestId('max-saved-entries-input'), '100');
    fireEvent(screen.getByTestId('max-saved-entries-input'), 'blur');
    await waitFor(() => expect(mockSetMaxSavedEntries).toHaveBeenCalledWith(100));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows a confirmation alert with the exact delete count when lowering the max below the current saved count', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockGetSavedEntriesCount.mockResolvedValue(500);
    renderScreen();
    await waitFor(() => screen.getByTestId('max-saved-entries-input'));
    fireEvent.changeText(screen.getByTestId('max-saved-entries-input'), '100');
    fireEvent(screen.getByTestId('max-saved-entries-input'), 'blur');
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Reduce Max Saved Entries?',
        expect.stringContaining('400 oldest of your 500 saved entries'),
        expect.any(Array)
      );
    });
    expect(mockSetMaxSavedEntries).not.toHaveBeenCalled();
  });

  it('saves and trims when Continue is chosen after lowering the max', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockGetSavedEntriesCount.mockResolvedValue(500);
    renderScreen();
    await waitFor(() => screen.getByTestId('max-saved-entries-input'));
    fireEvent.changeText(screen.getByTestId('max-saved-entries-input'), '100');
    fireEvent(screen.getByTestId('max-saved-entries-input'), 'blur');
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const continueBtn = buttons.find(b => b.text === 'Continue');
    await continueBtn!.onPress!();
    expect(mockSetMaxSavedEntries).toHaveBeenCalledWith(100);
    expect(mockTrimSaved).toHaveBeenCalledWith(100);
    expect(mockRefreshSaved).toHaveBeenCalled();
  });

  it('reverts the input and does not save, trim, or refresh when Cancel is chosen after lowering the max', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockGetSavedEntriesCount.mockResolvedValue(500);
    renderScreen();
    await waitFor(() => screen.getByTestId('max-saved-entries-input'));
    fireEvent.changeText(screen.getByTestId('max-saved-entries-input'), '100');
    fireEvent(screen.getByTestId('max-saved-entries-input'), 'blur');
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const cancelBtn = buttons.find(b => b.text === 'Cancel');
    await cancelBtn!.onPress!();
    await waitFor(() => {
      expect(screen.getByTestId('max-saved-entries-input').props.value).toBe('500');
    });
    expect(mockSetMaxSavedEntries).not.toHaveBeenCalled();
    expect(mockTrimSaved).not.toHaveBeenCalled();
    expect(mockRefreshSaved).not.toHaveBeenCalled();
  });

  it('saves low-token threshold on blur with a valid value', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('low-token-threshold-input'));
    fireEvent.changeText(screen.getByTestId('low-token-threshold-input'), '75');
    fireEvent(screen.getByTestId('low-token-threshold-input'), 'blur');
    await waitFor(() => {
      expect(mockSetLowTokenThreshold).toHaveBeenCalledWith(75);
    });
  });

  it('reverts max saved entries to the current value on invalid input', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('max-saved-entries-input'));
    fireEvent.changeText(screen.getByTestId('max-saved-entries-input'), 'abc');
    fireEvent(screen.getByTestId('max-saved-entries-input'), 'blur');
    await waitFor(() => {
      expect(screen.getByTestId('max-saved-entries-input').props.value).toBe('500');
    });
    expect(mockSetMaxSavedEntries).not.toHaveBeenCalled();
  });

  it('reverts low-token threshold on out-of-range input', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('low-token-threshold-input'));
    fireEvent.changeText(screen.getByTestId('low-token-threshold-input'), '0');
    fireEvent(screen.getByTestId('low-token-threshold-input'), 'blur');
    await waitFor(() => {
      expect(screen.getByTestId('low-token-threshold-input').props.value).toBe('90');
    });
    expect(mockSetLowTokenThreshold).not.toHaveBeenCalled();
  });

  it('shows the loaded cache TTL value', async () => {
    mockGetCacheTtlDays.mockResolvedValue(30);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('cache-ttl-days-input').props.value).toBe('30');
    });
  });

  it('saves cache TTL on blur with a valid value', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('cache-ttl-days-input'));
    fireEvent.changeText(screen.getByTestId('cache-ttl-days-input'), '180');
    fireEvent(screen.getByTestId('cache-ttl-days-input'), 'blur');
    await waitFor(() => {
      expect(mockSetCacheTtlDays).toHaveBeenCalledWith(180);
    });
    expect(mockPurgeExpiredCache).toHaveBeenCalledWith(180);
  });

  it('increasing the cache TTL does not show a confirmation alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderScreen();
    await waitFor(() => screen.getByTestId('cache-ttl-days-input'));
    fireEvent.changeText(screen.getByTestId('cache-ttl-days-input'), '180');
    fireEvent(screen.getByTestId('cache-ttl-days-input'), 'blur');
    await waitFor(() => expect(mockSetCacheTtlDays).toHaveBeenCalledWith(180));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not show a confirmation alert when decreasing the TTL would not expire anything', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockCountExpiringCache.mockResolvedValue(0);
    renderScreen();
    await waitFor(() => screen.getByTestId('cache-ttl-days-input'));
    fireEvent.changeText(screen.getByTestId('cache-ttl-days-input'), '30');
    fireEvent(screen.getByTestId('cache-ttl-days-input'), 'blur');
    await waitFor(() => expect(mockSetCacheTtlDays).toHaveBeenCalledWith(30));
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('shows a confirmation alert with the exact expiring count when decreasing the TTL', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockCountExpiringCache.mockResolvedValue(42);
    renderScreen();
    await waitFor(() => screen.getByTestId('cache-ttl-days-input'));
    fireEvent.changeText(screen.getByTestId('cache-ttl-days-input'), '30');
    fireEvent(screen.getByTestId('cache-ttl-days-input'), 'blur');
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Reduce Cache Duration?',
        expect.stringContaining('42 cached results'),
        expect.any(Array)
      );
    });
    expect(mockSetCacheTtlDays).not.toHaveBeenCalled();
  });

  it('saves and purges the cache when Continue is chosen after decreasing the TTL', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockCountExpiringCache.mockResolvedValue(42);
    renderScreen();
    await waitFor(() => screen.getByTestId('cache-ttl-days-input'));
    fireEvent.changeText(screen.getByTestId('cache-ttl-days-input'), '30');
    fireEvent(screen.getByTestId('cache-ttl-days-input'), 'blur');
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const continueBtn = buttons.find(b => b.text === 'Continue');
    await continueBtn!.onPress!();
    expect(mockSetCacheTtlDays).toHaveBeenCalledWith(30);
    expect(mockPurgeExpiredCache).toHaveBeenCalledWith(30);
  });

  it('reverts the input and does not save when Cancel is chosen after decreasing the TTL', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockCountExpiringCache.mockResolvedValue(42);
    renderScreen();
    await waitFor(() => screen.getByTestId('cache-ttl-days-input'));
    fireEvent.changeText(screen.getByTestId('cache-ttl-days-input'), '30');
    fireEvent(screen.getByTestId('cache-ttl-days-input'), 'blur');
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const cancelBtn = buttons.find(b => b.text === 'Cancel');
    await cancelBtn!.onPress!();
    await waitFor(() => {
      expect(screen.getByTestId('cache-ttl-days-input').props.value).toBe('90');
    });
    expect(mockSetCacheTtlDays).not.toHaveBeenCalled();
    expect(mockPurgeExpiredCache).not.toHaveBeenCalled();
  });

  it('reverts cache TTL on out-of-range input', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('cache-ttl-days-input'));
    fireEvent.changeText(screen.getByTestId('cache-ttl-days-input'), '366');
    fireEvent(screen.getByTestId('cache-ttl-days-input'), 'blur');
    await waitFor(() => {
      expect(screen.getByTestId('cache-ttl-days-input').props.value).toBe('90');
    });
    expect(mockSetCacheTtlDays).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Verterbukh exhausted alert toggle
// ---------------------------------------------------------------------------

describe('SettingsScreen — Verterbukh exhausted alert toggle', () => {
  it('reflects the loaded setting value', async () => {
    mockGetVerterbukhExhaustedAlert.mockResolvedValue(true);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('verterbukh-exhausted-alert-toggle').props.value).toBe(true);
    });
  });

  it('defaults to off when the setting is false', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('verterbukh-exhausted-alert-toggle').props.value).toBe(false);
    });
  });

  it('calls setVerterbukhExhaustedAlert when toggled on', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('verterbukh-exhausted-alert-toggle'));
    fireEvent(screen.getByTestId('verterbukh-exhausted-alert-toggle'), 'valueChange', true);
    await waitFor(() => {
      expect(mockSetVerterbukhExhaustedAlert).toHaveBeenCalledWith(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Verterbukh low-token alert toggle
// ---------------------------------------------------------------------------

describe('SettingsScreen — Verterbukh low-token alert toggle', () => {
  it('reflects the loaded setting value', async () => {
    mockGetVerterbukhLowTokenAlert.mockResolvedValue(true);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('verterbukh-low-token-alert-toggle').props.value).toBe(true);
    });
  });

  it('reflects off when the setting is false', async () => {
    mockGetVerterbukhLowTokenAlert.mockResolvedValue(false);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('verterbukh-low-token-alert-toggle').props.value).toBe(false);
    });
  });

  it('calls setVerterbukhLowTokenAlert when toggled off', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('verterbukh-low-token-alert-toggle'));
    fireEvent(screen.getByTestId('verterbukh-low-token-alert-toggle'), 'valueChange', false);
    await waitFor(() => {
      expect(mockSetVerterbukhLowTokenAlert).toHaveBeenCalledWith(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Save-trim alert toggle
// ---------------------------------------------------------------------------

describe('SettingsScreen — save-trim alert toggle', () => {
  it('reflects the loaded setting value', async () => {
    mockGetSaveTrimAlert.mockResolvedValue(true);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('save-trim-alert-toggle').props.value).toBe(true);
    });
  });

  it('reflects off when the setting is false', async () => {
    mockGetSaveTrimAlert.mockResolvedValue(false);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('save-trim-alert-toggle').props.value).toBe(false);
    });
  });

  it('calls setSaveTrimAlert when toggled off', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('save-trim-alert-toggle'));
    fireEvent(screen.getByTestId('save-trim-alert-toggle'), 'valueChange', false);
    await waitFor(() => {
      expect(mockSetSaveTrimAlert).toHaveBeenCalledWith(false);
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

  it('shows the Login form, not the logged-in status, when credentials are saved but the session is inactive (e.g. after app restart in short-term mode)', async () => {
    (hasActiveSession as jest.Mock).mockReturnValue(false);
    renderScreen();
    await waitFor(() => {
      expect(screen.queryByTestId('logged-in-status')).toBeNull();
      expect(screen.queryByTestId('logout-button')).toBeNull();
      expect(screen.getByTestId('login-button')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

describe('SettingsScreen — login flow', () => {
  it('calls login and setInMemoryCredentials (not saveCredentials) when keepLoggedIn is off', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('username-input'));

    fireEvent.changeText(screen.getByTestId('username-input'), 'testuser');
    fireEvent.changeText(screen.getByTestId('password-input'), 'testpass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'testuser', password: 'testpass' });
      expect(setInMemoryCredentials as jest.Mock).toHaveBeenCalledWith({ username: 'testuser', password: 'testpass' });
      expect(mockSaveCredentials).not.toHaveBeenCalled();
    });
  });

  it('calls login and saveCredentials (not setInMemoryCredentials) when keepLoggedIn is on', async () => {
    (getVerterbukhKeepLoggedIn as jest.Mock).mockResolvedValue(true);
    renderScreen();
    await waitFor(() => screen.getByTestId('username-input'));

    fireEvent.changeText(screen.getByTestId('username-input'), 'testuser');
    fireEvent.changeText(screen.getByTestId('password-input'), 'testpass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ username: 'testuser', password: 'testpass' });
      expect(mockSaveCredentials).toHaveBeenCalledWith({ username: 'testuser', password: 'testpass' });
      expect(setInMemoryCredentials as jest.Mock).not.toHaveBeenCalled();
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

  it('clears the stale quota on successful login when the response has no quota to show', async () => {
    (getVerterbukhQuota as jest.Mock).mockResolvedValue({ used: 4, total: 5 });
    renderScreen();
    await waitFor(() => screen.getByTestId('username-input'));

    fireEvent.changeText(screen.getByTestId('username-input'), 'newuser');
    fireEvent.changeText(screen.getByTestId('password-input'), 'newpass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(mockClearVerterbukhQuota).toHaveBeenCalledTimes(1);
    });
  });

  it('saves and displays the new account\'s quota from the login response, without a search', async () => {
    mockLogin.mockResolvedValue({ used: 2, total: 5 }); // fresh, parsed from the login response
    renderScreen();
    await waitFor(() => screen.getByTestId('username-input'));

    fireEvent.changeText(screen.getByTestId('username-input'), 'newuser');
    fireEvent.changeText(screen.getByTestId('password-input'), 'newpass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(mockSaveVerterbukhQuota).toHaveBeenCalledWith(2, 5);
    });
    expect(mockClearVerterbukhQuota).not.toHaveBeenCalled();
  });

  it('does not clear quota when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Login failed'));
    renderScreen();
    await waitFor(() => screen.getByTestId('username-input'));

    fireEvent.changeText(screen.getByTestId('username-input'), 'testuser');
    fireEvent.changeText(screen.getByTestId('password-input'), 'wrongpass');
    fireEvent.press(screen.getByTestId('login-button'));

    await waitFor(() => {
      expect(screen.getByTestId('status-message')).toBeTruthy();
    });
    expect(mockClearVerterbukhQuota).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Logout flow
// ---------------------------------------------------------------------------

describe('SettingsScreen — logout flow', () => {
  beforeEach(() => {
    mockGetCredentials.mockResolvedValue({ username: 'testuser', password: 'testpass' });
  });

  it('calls logout and returns to logged-out state', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('logout-button'));

    fireEvent.press(screen.getByTestId('logout-button'));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('login-button')).toBeTruthy();
      expect(screen.queryByTestId('logout-button')).toBeNull();
    });
  });

  it('clears the quota on logout', async () => {
    (getVerterbukhQuota as jest.Mock).mockResolvedValue({ used: 4, total: 5 });
    renderScreen();
    await waitFor(() => screen.getByTestId('logout-button'));

    fireEvent.press(screen.getByTestId('logout-button'));

    await waitFor(() => {
      expect(mockClearVerterbukhQuota).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Appearance — theme selector
// ---------------------------------------------------------------------------

describe('SettingsScreen — appearance', () => {
  it('renders all three theme options', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('theme-option-system')).toBeTruthy();
      expect(screen.getByTestId('theme-option-dark')).toBeTruthy();
      expect(screen.getByTestId('theme-option-light')).toBeTruthy();
    });
  });

  it('saves dark theme preference when dark option is pressed', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('theme-option-dark'));
    fireEvent.press(screen.getByTestId('theme-option-dark'));
    await waitFor(() => {
      expect(mockSetThemePreference).toHaveBeenCalledWith('dark');
    });
  });

  it('saves light theme preference when light option is pressed', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('theme-option-light'));
    fireEvent.press(screen.getByTestId('theme-option-light'));
    await waitFor(() => {
      expect(mockSetThemePreference).toHaveBeenCalledWith('light');
    });
  });
});

// ---------------------------------------------------------------------------
// Clear cache
// ---------------------------------------------------------------------------

describe('SettingsScreen — clear cache', () => {
  it('renders the Clear Cache button in the Cache section', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId('clear-cache-button')).toBeTruthy();
      expect(screen.getByText('Clear cache')).toBeTruthy();
    });
  });

  it('shows a confirmation alert when the button is pressed', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderScreen();
    await waitFor(() => screen.getByTestId('clear-cache-button'));
    fireEvent.press(screen.getByTestId('clear-cache-button'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Clear Cache',
      expect.stringContaining('cannot be undone'),
      expect.any(Array)
    );
  });

  it('calls clearCache when the Continue button is pressed in the alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderScreen();
    await waitFor(() => screen.getByTestId('clear-cache-button'));
    fireEvent.press(screen.getByTestId('clear-cache-button'));
    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const continueBtn = buttons.find(b => b.text === 'Continue');
    await continueBtn!.onPress!();
    expect(clearCache).toHaveBeenCalledTimes(1);
  });

  it('does not call clearCache when Cancel is chosen', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderScreen();
    await waitFor(() => screen.getByTestId('clear-cache-button'));
    fireEvent.press(screen.getByTestId('clear-cache-button'));
    const buttons = alertSpy.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[];
    const cancelBtn = buttons.find(b => b.text === 'Cancel');
    // Cancel has no onPress — verifying clearCache was never invoked
    expect(cancelBtn?.onPress).toBeUndefined();
    expect(clearCache).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// About modal
// ---------------------------------------------------------------------------

describe('SettingsScreen — About modal', () => {
  it('is hidden until the About row is tapped', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('about-row'));
    expect(screen.queryByTestId('about-modal-close')).toBeNull();
  });

  it('opens when the About row is tapped', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('about-row'));
    fireEvent.press(screen.getByTestId('about-row'));
    expect(screen.getByTestId('about-modal-close')).toBeTruthy();
    // "About YidDict" now appears twice: the row label and the modal title
    expect(screen.getAllByText('About YidDict').length).toBe(2);
  });

  it('shows the required Google Translate disclaimer', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('about-row'));
    fireEvent.press(screen.getByTestId('about-row'));
    expect(screen.getByText(/GOOGLE DISCLAIMS ALL WARRANTIES/)).toBeTruthy();
  });

  it('closes when the close button is pressed', async () => {
    renderScreen();
    await waitFor(() => screen.getByTestId('about-row'));
    fireEvent.press(screen.getByTestId('about-row'));
    fireEvent.press(screen.getByTestId('about-modal-close'));
    expect(screen.queryByTestId('about-modal-close')).toBeNull();
  });
});
