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

jest.mock('../services/verterbukh-service', () => ({
  lookupVerterbukh: jest.fn(),
}));

jest.mock('../services/verterbukh-auth', () => ({
  getCredentials: jest.fn(),
}));

jest.mock('../db/cacheDb', () => ({
  getCachedEntries: jest.fn(),
  saveToCache: jest.fn(),
  logSearchHistory: jest.fn(),
}));

jest.mock('../db/settingsDb', () => ({
  getSourceOrder: jest.fn(),
  SOURCE_LABELS: jest.requireActual('../db/settingsDb').SOURCE_LABELS,
}));

import { lookupFinkel } from '../services/finkelService';
import { lookupVerterbukh } from '../services/verterbukh-service';
import { getCredentials } from '../services/verterbukh-auth';
import { getCachedEntries, saveToCache, logSearchHistory } from '../db/cacheDb';
import { getSourceOrder } from '../db/settingsDb';

const mockLookup = lookupFinkel as jest.Mock;
const mockLookupVerterbukh = lookupVerterbukh as jest.Mock;
const mockGetCredentials = getCredentials as jest.Mock;
const mockGetCached = getCachedEntries as jest.Mock;
const mockSaveCache = saveToCache as jest.Mock;
const mockLogHistory = logSearchHistory as jest.Mock;
const mockGetSourceOrder = getSourceOrder as jest.Mock;

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
  // Source order: finkel only by default — keeps existing tests simple
  mockGetSourceOrder.mockResolvedValue(['finkel', 'none', 'none']);
  // Not logged in to Verterbukh by default
  mockGetCredentials.mockResolvedValue(null);
  mockGetCached.mockResolvedValue(null);
  mockLookup.mockResolvedValue([]);
  mockLookupVerterbukh.mockResolvedValue({ entries: [], choices: null });
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
  it('shows the no-results message when all sources return nothing', async () => {
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

describe('SearchScreen — source order', () => {
  it('shows Finkel badge when Finkel returns results', async () => {
    mockLookup.mockResolvedValue(sampleEntries);
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByText('Finkel')).toBeTruthy();
    });
  });

  it('skips Verterbukh when not logged in', async () => {
    mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'none']);
    mockGetCredentials.mockResolvedValue(null); // not logged in
    mockLookup.mockResolvedValue([]);           // Finkel returns nothing

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('no-results'));
    expect(mockLookupVerterbukh).not.toHaveBeenCalled();
  });

  it('falls through to Verterbukh when Finkel returns nothing and user is logged in', async () => {
    const verterbukSample = { entries: [{ yiddishHebrew: 'שיין', yiddishRomanized: 'sheyn', english: 'pretty', partOfSpeech: 'adj.', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null }], choices: null };
    mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    mockLookup.mockResolvedValue([]);            // Finkel returns nothing
    mockLookupVerterbukh.mockResolvedValue(verterbukSample);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByText('Verterbukh')).toBeTruthy();
      expect(screen.getAllByTestId('entry-card').length).toBe(1);
    });
  });

  it('shows Verterbukh badge when Verterbukh is the result source', async () => {
    const verterbukSample = { entries: [{ yiddishHebrew: 'שיין', yiddishRomanized: null, english: 'pretty', partOfSpeech: null, grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null }], choices: null };
    mockGetSourceOrder.mockResolvedValue(['verterbukh', 'none', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    mockLookupVerterbukh.mockResolvedValue(verterbukSample);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByText('Verterbukh')).toBeTruthy();
    });
  });
});

describe('SearchScreen — Verterbukh quota badge', () => {
  const sampleVerterbukEntry = {
    entries: [{ yiddishHebrew: 'שיין', yiddishRomanized: 'sheyn', english: 'pretty', partOfSpeech: 'adj.', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null }],
    choices: null,
  };

  beforeEach(() => {
    mockGetSourceOrder.mockResolvedValue(['verterbukh', 'none', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
  });

  it('shows quota badge with used/total when Verterbukh returns quota', async () => {
    mockLookupVerterbukh.mockResolvedValue({ ...sampleVerterbukEntry, quota: { used: 3, total: 100 } });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('quota-badge')).toBeTruthy();
      expect(screen.getByText('3/100')).toBeTruthy();
    });
  });

  it('does not show quota badge when quota is null', async () => {
    mockLookupVerterbukh.mockResolvedValue({ ...sampleVerterbukEntry, quota: null });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(screen.queryByTestId('quota-badge')).toBeNull();
  });

  it('clears quota badge when clear button is pressed', async () => {
    mockLookupVerterbukh.mockResolvedValue({ ...sampleVerterbukEntry, quota: { used: 3, total: 100 } });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('quota-badge'));

    fireEvent.press(screen.getByTestId('clear-button'));
    expect(screen.queryByTestId('quota-badge')).toBeNull();
  });

  it('fires Alert when used tokens exceed 90%', async () => {
    const alertSpy = jest.spyOn(require('react-native'), 'Alert', 'get').mockReturnValue({ alert: jest.fn() });
    const mockAlert = jest.fn();
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(mockAlert);

    // 92 used out of 100 → 92% used > 90% threshold → triggers
    mockLookupVerterbukh.mockResolvedValue({ ...sampleVerterbukEntry, quota: { used: 92, total: 100 } });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('quota-badge'));
    expect(mockAlert).toHaveBeenCalledWith(
      'Low Verterbukh Tokens',
      expect.stringContaining('92'),
    );

    alertSpy.mockRestore();
  });

  it('does NOT fire low-token Alert when used tokens are below 90%', async () => {
    const mockAlert = jest.fn();
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(mockAlert);

    // 50 used out of 100 → 50% used → no alert
    mockLookupVerterbukh.mockResolvedValue({ ...sampleVerterbukEntry, quota: { used: 50, total: 100 } });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('quota-badge'));
    expect(mockAlert).not.toHaveBeenCalledWith('Low Verterbukh Tokens', expect.any(String));
  });
});

describe('SearchScreen — Verterbukh other options', () => {
  const sampleChoices = [
    { label: 'LOYFN', hebrewLemma: 'לױפֿן' },
    { label: 'LOYFER', hebrewLemma: 'לױפֿער' },
  ];
  const sampleVerterbukEntry = { entries: [{ yiddishHebrew: 'לױפֿן', yiddishRomanized: 'loyfn', english: 'run', partOfSpeech: 'verb', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null }], choices: sampleChoices };

  beforeEach(() => {
    mockGetSourceOrder.mockResolvedValue(['verterbukh', 'none', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
  });

  it('shows the auto-selected result and "Other options" panel when choices are returned', async () => {
    mockLookupVerterbukh.mockResolvedValue(sampleVerterbukEntry);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyf');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getAllByTestId('entry-card').length).toBe(1);
      expect(screen.getByTestId('other-options-view')).toBeTruthy();
      expect(screen.getByText('LOYFN')).toBeTruthy();
      expect(screen.getByText('LOYFER')).toBeTruthy();
    });
  });

  it('does not show "Other options" panel when no choices are returned', async () => {
    mockLookupVerterbukh.mockResolvedValue({ entries: sampleVerterbukEntry.entries, choices: null });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyfn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(screen.queryByTestId('other-options-view')).toBeNull();
  });

  it('fetches the selected other option and replaces results', async () => {
    mockLookupVerterbukh
      .mockResolvedValueOnce(sampleVerterbukEntry) // initial search
      .mockResolvedValueOnce({ entries: [{ yiddishHebrew: 'לױפֿער', yiddishRomanized: 'loyfer', english: 'runner', partOfSpeech: 'noun', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null }], choices: null }); // choice lookup

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyf');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('other-options-view'));
    fireEvent.press(screen.getByTestId('other-option-לױפֿער'));

    await waitFor(() => {
      expect(mockLookupVerterbukh).toHaveBeenCalledWith('loyf', 'לױפֿער');
      expect(screen.getByText('runner')).toBeTruthy();
      expect(screen.queryByTestId('other-options-view')).toBeNull();
    });
  });
});
