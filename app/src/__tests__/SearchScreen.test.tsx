/**
 * SearchScreen.test.tsx
 *
 * Tests for the full SearchScreen UI: search bar, loading state, results
 * rendering, cache-hit badge, error state, and empty-state messaging.
 *
 * External dependencies (finkelService, cacheDb) are mocked so no network
 * or SQLite access occurs.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ThemeProvider, lightTheme, darkTheme } from '../context/ThemeContext';
import SearchScreen from '../screens/SearchScreen';
import { FinkelEntry } from '../services/finkelService';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUseColorScheme = jest.fn(() => 'light' as 'light' | 'dark');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => mockUseColorScheme(),
}));

jest.mock('../services/finkelService', () => ({
  lookupFinkel: jest.fn(),
}));

jest.mock('../db/cacheDb', () => ({
  getCachedEntries: jest.fn(),
  saveToCache: jest.fn(),
  logSearchHistory: jest.fn(),
}));

import { lookupFinkel } from '../services/finkelService';
import { getCachedEntries, saveToCache, logSearchHistory } from '../db/cacheDb';

const mockLookup = lookupFinkel as jest.Mock;
const mockGetCached = getCachedEntries as jest.Mock;
const mockSaveCache = saveToCache as jest.Mock;
const mockLogHistory = logSearchHistory as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderScreen() {
  return render(
    <ThemeProvider>
      <SearchScreen />
    </ThemeProvider>
  );
}

const sampleEntries: FinkelEntry[] = [
  {
    yiddishRomanized: 'sheyn',
    yiddishHebrew: 'שיין',
    english: 'pretty',
    partOfSpeech: 'adjective',
    conjugationInfo: null,
    isPhrase: false,
  },
  {
    yiddishRomanized: 'sheynkayt',
    yiddishHebrew: null,
    english: 'beauty',
    partOfSpeech: 'noun',
    conjugationInfo: 'gender f',
    isPhrase: true,
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCached.mockResolvedValue(null);    // no cache by default
  mockLookup.mockResolvedValue([]);          // no results by default
  mockSaveCache.mockResolvedValue(undefined);
  mockLogHistory.mockResolvedValue(undefined);
});

describe('SearchScreen — initial render', () => {
  it('renders the search input', () => {
    renderScreen();
    expect(screen.getByTestId('search-input')).toBeTruthy();
  });

  it('renders the search button', () => {
    renderScreen();
    expect(screen.getByTestId('search-button')).toBeTruthy();
  });

  it('shows no results or loading on first render', () => {
    renderScreen();
    expect(screen.queryByTestId('loading-indicator')).toBeNull();
    expect(screen.queryByTestId('entry-card')).toBeNull();
    expect(screen.queryByTestId('no-results')).toBeNull();
  });
});

describe('SearchScreen — loading state', () => {
  it('shows a loading indicator while waiting for results', async () => {
    mockGetCached.mockResolvedValue(null);
    // lookupFinkel never resolves during this check
    mockLookup.mockReturnValue(new Promise(() => {}));

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('loading-indicator')).toBeTruthy();
    });
  });
});

describe('SearchScreen — results from network', () => {
  beforeEach(() => {
    mockGetCached.mockResolvedValue(null);
    mockLookup.mockResolvedValue(sampleEntries);
  });

  it('renders entry cards after a successful search', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getAllByTestId('entry-card').length).toBe(2);
    });
  });

  it('displays the English definition', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByText('pretty')).toBeTruthy();
    });
  });

  it('displays the YIVO romanization', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByText('sheyn')).toBeTruthy();
    });
  });

  it('saves results to cache', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(mockSaveCache).toHaveBeenCalledTimes(1));
    expect(mockSaveCache).toHaveBeenCalledWith('sheyn', sampleEntries, 'finkel');
  });

  it('logs the search to history', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(mockLogHistory).toHaveBeenCalledTimes(1));
    expect(mockLogHistory).toHaveBeenCalledWith('sheyn', expect.any(String), 'finkel');
  });

  it('does not show the cached badge for fresh results', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(screen.queryByText('cached')).toBeNull();
  });
});

describe('SearchScreen — cache hit', () => {
  beforeEach(() => {
    mockGetCached.mockResolvedValue(sampleEntries);
  });

  it('shows the cached badge when results come from cache', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByText('cached')).toBeTruthy();
    });
  });

  it('does not call lookupFinkel on a cache hit', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('still logs the search to history on a cache hit', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(mockLogHistory).toHaveBeenCalledTimes(1));
  });
});

describe('SearchScreen — empty results', () => {
  it('shows the no-results message when Finkel returns nothing', async () => {
    mockLookup.mockResolvedValue([]);
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'xyznotaword');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('no-results')).toBeTruthy();
    });
  });

  it('does not save an empty result set to cache', async () => {
    mockLookup.mockResolvedValue([]);
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'xyznotaword');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('no-results'));
    expect(mockSaveCache).not.toHaveBeenCalled();
  });
});

describe('SearchScreen — error state', () => {
  it('shows an error message when lookupFinkel throws', async () => {
    mockLookup.mockRejectedValue(new Error('Network Error'));
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeTruthy();
    });
  });
});

describe('SearchScreen — clear button', () => {
  it('clears the input and hides results', async () => {
    mockLookup.mockResolvedValue(sampleEntries);
    renderScreen();

    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getAllByTestId('entry-card'));

    fireEvent.press(screen.getByTestId('clear-button'));
    expect(screen.queryByTestId('entry-card')).toBeNull();
    expect(screen.queryByTestId('no-results')).toBeNull();
  });
});

describe('SearchScreen — theme', () => {
  it('applies light theme background to the root view', () => {
    renderScreen();
    const root = screen.getByTestId('search-root');
    const flat = Object.assign({}, ...(root.props.style ?? []));
    expect(flat.backgroundColor).toBe(lightTheme.background);
  });

  it('applies dark theme background when scheme is dark', () => {
    mockUseColorScheme.mockReturnValue('dark');
    renderScreen();
    const root = screen.getByTestId('search-root');
    const flat = Object.assign({}, ...(root.props.style ?? []));
    expect(flat.backgroundColor).toBe(darkTheme.background);
  });
});

describe('SearchScreen — input handling', () => {
  it('does nothing when search is submitted with empty input', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('search-button'));
    expect(mockGetCached).not.toHaveBeenCalled();
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('calls lookupFinkel with isHebrew=true for Hebrew input', async () => {
    mockLookup.mockResolvedValue([]);
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'שיין');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(mockLookup).toHaveBeenCalledTimes(1));
    expect(mockLookup).toHaveBeenCalledWith('שיין', true);
  });

  it('calls lookupFinkel with isHebrew=false for Latin input', async () => {
    mockLookup.mockResolvedValue([]);
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(mockLookup).toHaveBeenCalledTimes(1));
    expect(mockLookup).toHaveBeenCalledWith('sheyn', false);
  });
});

describe('SearchScreen — error recovery', () => {
  it('clears the error state when a new search is started', async () => {
    mockLookup.mockRejectedValueOnce(new Error('Network Error'));
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(screen.getByTestId('error-message')).toBeTruthy());

    mockLookup.mockResolvedValueOnce(sampleEntries);
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(screen.queryByTestId('error-message')).toBeNull());
  });
});
