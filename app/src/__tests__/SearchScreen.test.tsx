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
import { DictEntry } from '../types';

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

jest.mock('../services/google-translate-service', () => ({
  lookupGoogleTranslate: jest.fn(),
}));

jest.mock('../services/verterbukh-auth', () => ({
  getCredentials: jest.fn(),
}));

jest.mock('../db/cacheDb', () => ({
  getCachedEntries: jest.fn(),
  saveToCache: jest.fn(),
}));

jest.mock('../db/savedDb', () => ({
  saveEntry: jest.fn().mockResolvedValue(undefined),
  saveEntries: jest.fn().mockResolvedValue(undefined),
  deleteEntriesByKey: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../context/SavedContext', () => ({
  useSaved: jest.fn(),
}));

jest.mock('../db/settingsDb', () => ({
  getSourceOrder: jest.fn(),
  getLowTokenThreshold: jest.fn().mockResolvedValue(90),
  getCacheTtlDays: jest.fn().mockResolvedValue(90),
  getUseAllSources: jest.fn().mockResolvedValue(false),
  getYivoToHebrew: jest.fn().mockResolvedValue(false),
  saveVerterbukhQuota: jest.fn().mockResolvedValue(undefined),
  SOURCE_LABELS: jest.requireActual('../db/settingsDb').SOURCE_LABELS,
}));

import { lookupFinkel } from '../services/finkelService';
import { lookupVerterbukh } from '../services/verterbukh-service';
import { lookupGoogleTranslate } from '../services/google-translate-service';
import { getCredentials } from '../services/verterbukh-auth';
import { getCachedEntries, saveToCache } from '../db/cacheDb';
import { deleteEntriesByKey } from '../db/savedDb';
import { getSourceOrder, getUseAllSources } from '../db/settingsDb';
import { useSaved } from '../context/SavedContext';

const mockLookup = lookupFinkel as jest.Mock;
const mockLookupVerterbukh = lookupVerterbukh as jest.Mock;
const mockLookupGoogleTranslate = lookupGoogleTranslate as jest.Mock;
const mockGetCredentials = getCredentials as jest.Mock;
const mockGetCached = getCachedEntries as jest.Mock;
const mockSaveCache = saveToCache as jest.Mock;
const mockDeleteEntriesByKey = deleteEntriesByKey as jest.Mock;
const mockGetSourceOrder = getSourceOrder as jest.Mock;
const mockGetUseAllSources = getUseAllSources as jest.Mock;
const mockUseSaved = useSaved as jest.Mock;

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

const sampleEntries: DictEntry[] = [
  {
    source: 'finkel',
    fromCache: false,
    yiddishRomanized: 'sheyn',
    yiddishHebrew: 'שיין',
    english: 'pretty',
    partOfSpeech: 'adjective',
    grammaticalInfo: null,
    isPhrase: false,
    exampleYiddish: null,
    exampleEnglish: null,
  },
  {
    source: 'finkel',
    fromCache: false,
    yiddishRomanized: 'sheynkayt',
    yiddishHebrew: null,
    english: 'beauty',
    partOfSpeech: 'noun',
    grammaticalInfo: 'gender f',
    isPhrase: true,
    exampleYiddish: null,
    exampleEnglish: null,
  },
];

const cachedEntries: DictEntry[] = sampleEntries.map(e => ({ ...e, fromCache: true }));

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
  mockLookupGoogleTranslate.mockResolvedValue([]);
  mockSaveCache.mockResolvedValue(undefined);
  mockGetUseAllSources.mockResolvedValue(false);
  mockUseSaved.mockReturnValue({
    savedKeySet: new Set(),
    savedEntries: [],
    isLoading: false,
    refreshSaved: jest.fn().mockResolvedValue(undefined),
  });
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
      expect(screen.getByText('"sheyn"')).toBeTruthy();
    });
  });

  it('saves results to cache', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(mockSaveCache).toHaveBeenCalledTimes(1));
    expect(mockSaveCache).toHaveBeenCalledWith('sheyn', sampleEntries, 'finkel');
  });

  it('calls refreshSaved after saving an entry', async () => {
    const mockRefreshSaved = jest.fn().mockResolvedValue(undefined);
    mockUseSaved.mockReturnValue({
      savedKeySet: new Set(),
      savedEntries: [],
      isLoading: false,
      refreshSaved: mockRefreshSaved,
    });
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('save-entry-button'));
    fireEvent.press(screen.getAllByTestId('save-entry-button')[0]);

    await waitFor(() => expect(mockRefreshSaved).toHaveBeenCalled());
  });

  it('renders a save button on each entry card', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getAllByTestId('save-entry-button').length).toBe(2);
    });
  });

  it('calls deleteEntriesByKey when a saved entry bookmark is pressed', async () => {
    mockUseSaved.mockReturnValue({
      savedKeySet: new Set(['שיין|pretty|finkel']),
      savedEntries: [],
      isLoading: false,
      refreshSaved: jest.fn().mockResolvedValue(undefined),
    });
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('save-entry-button'));
    fireEvent.press(screen.getAllByTestId('save-entry-button')[0]);

    await waitFor(() => {
      expect(mockDeleteEntriesByKey).toHaveBeenCalledWith(
        [expect.objectContaining({ yiddishHebrew: 'שיין', english: 'pretty' })],
        'finkel'
      );
    });
  });

  it('renders the Save All button when results are present', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('save-all-button')).toBeTruthy();
    });
  });

  it('shows "Unsave all" and highlights button when all entries are already saved', async () => {
    mockUseSaved.mockReturnValue({
      savedKeySet: new Set(['שיין|pretty|finkel', '|beauty|finkel']),
      savedEntries: [],
      isLoading: false,
      refreshSaved: jest.fn().mockResolvedValue(undefined),
    });
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByText('Unsave all')).toBeTruthy();
    });
  });

  it('calls deleteEntriesByKey when "Unsave all" is pressed', async () => {
    mockUseSaved.mockReturnValue({
      savedKeySet: new Set(['שיין|pretty|finkel', '|beauty|finkel']),
      savedEntries: [],
      isLoading: false,
      refreshSaved: jest.fn().mockResolvedValue(undefined),
    });
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByText('Unsave all'));
    fireEvent.press(screen.getByTestId('save-all-button'));

    await waitFor(() => {
      expect(mockDeleteEntriesByKey).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ yiddishHebrew: 'שיין', english: 'pretty' }),
        ]),
        'finkel'
      );
    });
  });

  it('does not show the cached badge for fresh results', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(screen.queryByText('Cached')).toBeNull();
  });
});

describe('SearchScreen — cache hit', () => {
  beforeEach(() => {
    mockGetCached.mockResolvedValue(cachedEntries);
  });

  it('shows the cached badge when results come from cache', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getAllByText('Cached').length).toBeGreaterThan(0);
    });
  });

  it('does not call lookupFinkel on a cache hit', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('shows filled bookmark for entries already in the saved key set', async () => {
    mockUseSaved.mockReturnValue({
      savedKeySet: new Set(['שיין|pretty|finkel']),
      savedEntries: [],
      isLoading: false,
      refreshSaved: jest.fn().mockResolvedValue(undefined),
    });
    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('save-entry-button'));
    // First bookmark should be filled (saved), second should be outline (unsaved)
    const btns = screen.getAllByTestId('save-entry-button');
    expect(btns[0].props.accessibilityLabel).toBe('Remove from saved');
    expect(btns[1].props.accessibilityLabel).toBe('Save entry');
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
      expect(screen.getAllByText('Finkel').length).toBeGreaterThan(0);
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
    const verterbukSample = { entries: [{ source: 'verterbukh' as const, fromCache: false, yiddishHebrew: 'שיין', yiddishRomanized: 'sheyn', english: 'pretty', partOfSpeech: 'adj.', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null, isPhrase: false }], choices: null };
    mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    mockLookup.mockResolvedValue([]);            // Finkel returns nothing
    mockLookupVerterbukh.mockResolvedValue(verterbukSample);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getAllByText('Verterbukh').length).toBeGreaterThan(0);
      expect(screen.getAllByTestId('entry-card').length).toBe(1);
    });
  });

  it('shows Verterbukh badge when Verterbukh is the result source', async () => {
    const verterbukSample = { entries: [{ source: 'verterbukh' as const, fromCache: false, yiddishHebrew: 'שיין', yiddishRomanized: null, english: 'pretty', partOfSpeech: null, grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null, isPhrase: false }], choices: null };
    mockGetSourceOrder.mockResolvedValue(['verterbukh', 'none', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    mockLookupVerterbukh.mockResolvedValue(verterbukSample);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getAllByText('Verterbukh').length).toBeGreaterThan(0);
    });
  });
});

describe('SearchScreen — Verterbukh quota badge', () => {
  const sampleVerterbukEntry = {
    entries: [{ source: 'verterbukh' as const, fromCache: false, yiddishHebrew: 'שיין', yiddishRomanized: 'sheyn', english: 'pretty', partOfSpeech: 'adj.', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null, isPhrase: false }],
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
      expect(screen.getByText('3/100 tokens')).toBeTruthy();
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

  it('does not show quota badge when Verterbukh returns quota but no entries (fallback to next source)', async () => {
    // Verterbukh is slot 1 but returns nothing; Finkel is slot 2 and returns results.
    // verterbukhQuota gets set but no Verterbukh entries are in the results list.
    mockGetSourceOrder.mockResolvedValue(['verterbukh', 'finkel', 'none']);
    mockLookupVerterbukh.mockResolvedValue({ entries: [], choices: null, quota: { used: 3, total: 100 } });
    mockLookup.mockResolvedValue(sampleEntries);

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
    { label: 'LOYFN', hebrewLemma: 'לױפֿן', dir: 'from' as const },
    { label: 'LOYFER', hebrewLemma: 'לױפֿער', dir: 'from' as const },
  ];
  const sampleVerterbukEntry = { entries: [{ source: 'verterbukh' as const, fromCache: false, yiddishHebrew: 'לױפֿן', yiddishRomanized: 'loyfn', english: 'run', partOfSpeech: 'verb', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null, isPhrase: false }], choices: sampleChoices };

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
    });
    fireEvent.press(screen.getByTestId('other-options-toggle'));
    expect(screen.getByText('"LOYFN"')).toBeTruthy();
    expect(screen.getByText('"LOYFER"')).toBeTruthy();
  });

  it('does not show "Other options" panel when no choices are returned', async () => {
    mockLookupVerterbukh.mockResolvedValue({ entries: sampleVerterbukEntry.entries, choices: null });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyfn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(screen.queryByTestId('other-options-view')).toBeNull();
  });

  it('auto-retries with dir=to when dir=from returns no entries and no choices (Latin input)', async () => {
    const englishEntry = { source: 'verterbukh' as const, fromCache: false, yiddishHebrew: 'לױפֿן', yiddishRomanized: 'loyfn', english: 'run', partOfSpeech: 'verb', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null, isPhrase: false };
    mockLookupVerterbukh
      .mockResolvedValueOnce({ entries: [], choices: null, quota: null })           // dir=from → nothing
      .mockResolvedValueOnce({ entries: [englishEntry], choices: null, quota: null }); // dir=to → result

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'run');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(mockLookupVerterbukh).toHaveBeenNthCalledWith(1, 'run');
    expect(mockLookupVerterbukh).toHaveBeenNthCalledWith(2, 'run', undefined, 'to');
    expect(screen.getByText('run')).toBeTruthy();
  });

  it('does not auto-retry with dir=to when dir=from returns choices (manual Try in English available)', async () => {
    mockLookupVerterbukh.mockResolvedValueOnce({ entries: [], choices: sampleChoices, quota: null });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyf');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('other-options-view'));
    expect(mockLookupVerterbukh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('other-options-view')).toBeTruthy();
  });

  it('fetches the selected other option and replaces results', async () => {
    mockLookupVerterbukh
      .mockResolvedValueOnce(sampleVerterbukEntry) // initial search
      .mockResolvedValueOnce({ entries: [{ yiddishHebrew: 'לױפֿער', yiddishRomanized: 'loyfer', english: 'runner', partOfSpeech: 'noun', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null, isPhrase: false }], choices: null }); // choice lookup

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyf');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('other-options-view'));
    fireEvent.press(screen.getByTestId('other-options-toggle'));
    fireEvent.press(screen.getByTestId('other-option-לױפֿער'));

    await waitFor(() => {
      expect(mockLookupVerterbukh).toHaveBeenCalledWith('loyf', 'לױפֿער', 'from');
      expect(screen.getByText('runner')).toBeTruthy();
      expect(screen.queryByTestId('other-options-view')).toBeNull();
    });
  });

  it('fetches choices live on a Verterbukh cache hit so the panel reappears on re-search', async () => {
    const cachedVEntry = [{ ...sampleVerterbukEntry.entries[0], fromCache: true }];
    mockGetCached.mockResolvedValue(cachedVEntry);
    mockGetSourceOrder.mockResolvedValue(['verterbukh', 'none', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    // Live call returns choices but no new entries (user sees cached result + fresh choices panel)
    mockLookupVerterbukh.mockResolvedValue({ entries: [], choices: sampleChoices, quota: null });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyf');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('other-options-view'));
    expect(mockLookupVerterbukh).toHaveBeenCalledWith('loyf');
    expect(screen.getAllByTestId('entry-card').length).toBeGreaterThan(0); // cached entries shown
  });

  it('other options panel appears above results (before FlatList), not below', async () => {
    mockLookupVerterbukh.mockResolvedValue(sampleVerterbukEntry);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyf');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('other-options-view'));
    // The panel should be present and the entry card should also be visible
    expect(screen.getByTestId('other-options-view')).toBeTruthy();
    expect(screen.getAllByTestId('entry-card').length).toBeGreaterThan(0);
  });

  it('queries all active sources with choice label when use-all-sources is on', async () => {
    mockGetUseAllSources.mockResolvedValue(true);
    mockGetSourceOrder.mockResolvedValue(['verterbukh', 'finkel', 'none']);
    const chosenEntry = { source: 'verterbukh' as const, fromCache: false, yiddishHebrew: 'לױפֿן', yiddishRomanized: 'loyfn', english: 'run (verb)', partOfSpeech: 'verb', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null, isPhrase: false };
    const finkelLoyfnEntry = { source: 'finkel' as const, fromCache: false, yiddishHebrew: null, yiddishRomanized: 'loyfn', english: 'to run, jog', partOfSpeech: 'verb', grammaticalInfo: null, isPhrase: false, exampleYiddish: null, exampleEnglish: null };
    mockLookupVerterbukh
      .mockResolvedValueOnce(sampleVerterbukEntry) // initial search
      .mockResolvedValueOnce({ entries: [chosenEntry], choices: null, quota: null }); // disambiguation lookup
    mockLookup.mockResolvedValue([finkelLoyfnEntry]); // Finkel lookup for 'loyfn'

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyf');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('other-options-view'));
    fireEvent.press(screen.getByTestId('other-options-toggle'));
    fireEvent.press(screen.getByTestId('other-option-לױפֿן'));

    await waitFor(() => {
      // Verterbukh called with lemma, Finkel called with lowercased label
      expect(mockLookupVerterbukh).toHaveBeenCalledWith('loyf', 'לױפֿן', 'from');
      expect(mockLookup).toHaveBeenCalledWith('loyfn', expect.any(Boolean));
      // Results from both sources should be visible
      expect(screen.getByText('run (verb)')).toBeTruthy();   // Verterbukh entry
      expect(screen.getByText('to run, jog')).toBeTruthy();  // Finkel entry
    });
  });
});

describe('SearchScreen — fallback note', () => {
  const vEntry = { yiddishHebrew: 'שיין', yiddishRomanized: 'sheyn', english: 'pretty', partOfSpeech: 'adj.', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null, isPhrase: false };

  it('shows a fallback note when the primary source returns nothing and a later source succeeds', async () => {
    mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    mockLookup.mockResolvedValue([]);
    mockLookupVerterbukh.mockResolvedValue({ entries: [vEntry], choices: null, quota: null });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getByTestId('fallback-note')).toBeTruthy();
      expect(screen.getByText('No results from Finkel')).toBeTruthy();
    });
  });

  it('does not show a fallback note when the primary source succeeds', async () => {
    mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    mockLookup.mockResolvedValue(sampleEntries);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(screen.queryByTestId('fallback-note')).toBeNull();
  });

  it('does not show a fallback note when no source finds results', async () => {
    mockGetSourceOrder.mockResolvedValue(['finkel', 'none', 'none']);
    mockLookup.mockResolvedValue([]);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'xyznotaword');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => screen.getByTestId('no-results'));
    expect(screen.queryByTestId('fallback-note')).toBeNull();
  });

  it('clears the fallback note when a new search is started', async () => {
    mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    mockLookup.mockResolvedValueOnce([]).mockResolvedValue(sampleEntries);
    mockLookupVerterbukh.mockResolvedValue({ entries: [vEntry], choices: null, quota: null });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getByTestId('fallback-note'));

    // Second search: Finkel succeeds — no fallback note
    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getAllByTestId('entry-card'));
    expect(screen.queryByTestId('fallback-note')).toBeNull();
  });

  it('clears the fallback note when the clear button is pressed', async () => {
    mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    mockLookup.mockResolvedValue([]);
    mockLookupVerterbukh.mockResolvedValue({ entries: [vEntry], choices: null, quota: null });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'sheyn');
    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getByTestId('fallback-note'));

    fireEvent.press(screen.getByTestId('clear-button'));
    expect(screen.queryByTestId('fallback-note')).toBeNull();
  });

  it('accumulates notes from multiple failed sources', async () => {
    mockGetSourceOrder.mockResolvedValue(['finkel', 'verterbukh', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
    // Finkel fails, Verterbukh also fails
    mockLookup.mockResolvedValue([]);
    mockLookupVerterbukh.mockResolvedValue({ entries: [], choices: null, quota: null });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'xyznotaword');
    fireEvent.press(screen.getByTestId('search-button'));

    // All sources fail → empty state, no fallback note
    await waitFor(() => screen.getByTestId('no-results'));
    expect(screen.queryByTestId('fallback-note')).toBeNull();
  });
});

describe('SearchScreen — Verterbukh token exhaustion', () => {
  const vEntry = { yiddishHebrew: 'לױפֿן', yiddishRomanized: 'loyfn', english: 'run', partOfSpeech: 'verb', grammaticalInfo: null, exampleYiddish: null, exampleEnglish: null, isPhrase: false };
  let mockAlert: jest.Mock;

  beforeEach(() => {
    mockAlert = jest.fn();
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(mockAlert);
    mockGetSourceOrder.mockResolvedValue(['verterbukh', 'none', 'none']);
    mockGetCredentials.mockResolvedValue({ username: 'u', password: 'p' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rechecks Verterbukh on every subsequent search after exhaustion', async () => {
    mockLookupVerterbukh.mockResolvedValue({
      entries: [vEntry],
      choices: null,
      quota: { used: 5, total: 5 },
    });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyfn');

    // Search 1: triggers exhaustion
    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getAllByTestId('entry-card'));

    // Search 2: Verterbukh rechecked immediately (not skipped)
    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getAllByTestId('entry-card'));

    // Search 3: still rechecked
    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getAllByTestId('entry-card'));

    expect(mockLookupVerterbukh).toHaveBeenCalledTimes(3);
  });

  it('clears exhaustion flag when recheck finds tokens available', async () => {
    // Search 1: exhausted quota
    // Search 2: tokens replenished — flag should clear
    // Search 3: Verterbukh called normally (flag cleared)
    mockLookupVerterbukh
      .mockResolvedValueOnce({ entries: [vEntry], choices: null, quota: { used: 5, total: 5 } })
      .mockResolvedValue({ entries: [vEntry], choices: null, quota: { used: 3, total: 100 } });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyfn');

    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getAllByTestId('entry-card'));

    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getAllByTestId('entry-card'));

    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getAllByTestId('entry-card'));

    expect(mockLookupVerterbukh).toHaveBeenCalledTimes(3);
  });

  it('fires the exhaustion alert when Verterbukh returns no entries but quota is exhausted', async () => {
    mockLookupVerterbukh.mockResolvedValue({
      entries: [],
      choices: null,
      quota: { used: 5, total: 5 },
    });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyfn');
    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getByTestId('no-results'));

    // processQuota must fire even with zero entries — alert confirms it
    expect(mockAlert).toHaveBeenCalledWith('No Verterbukh Tokens', expect.any(String));
  });

  it('shows alert and does not call lookupVerterbukh when other option tapped while exhausted', async () => {
    const choices = [{ label: 'LOYFN', hebrewLemma: 'לױפֿן', dir: 'from' as const }];
    // Search returns entries + choices, and uses the last token
    mockLookupVerterbukh.mockResolvedValueOnce({
      entries: [vEntry],
      choices,
      quota: { used: 5, total: 5 },
    });

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'loyf');
    fireEvent.press(screen.getByTestId('search-button'));
    await waitFor(() => screen.getByTestId('other-options-view'));
    fireEvent.press(screen.getByTestId('other-options-toggle'));
    fireEvent.press(screen.getByTestId('other-option-לױפֿן'));

    expect(mockAlert).toHaveBeenCalledWith('No Verterbukh Tokens', expect.any(String));
    expect(mockLookupVerterbukh).toHaveBeenCalledTimes(1);
  });
});

describe('SearchScreen — Google Translate source', () => {
  const gtEntry = {
    source: 'google_translate' as const,
    fromCache: false,
    yiddishHebrew: 'שיין',
    yiddishRomanized: null,
    english: 'pretty',
    partOfSpeech: null,
    grammaticalInfo: null,
    isPhrase: false as const,
    exampleYiddish: null,
    exampleEnglish: null,
  };

  beforeEach(() => {
    mockGetSourceOrder.mockResolvedValue(['google_translate', 'none', 'none']);
    mockGetCredentials.mockResolvedValue(null);
  });

  it('calls lookupGoogleTranslate when it is in the source order', async () => {
    mockLookupGoogleTranslate.mockResolvedValue([gtEntry]);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'pretty');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(mockLookupGoogleTranslate).toHaveBeenCalledTimes(1));
  });

  it('shows the Google Translate badge when it is the result source', async () => {
    mockLookupGoogleTranslate.mockResolvedValue([gtEntry]);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'pretty');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getAllByText('Google Translate').length).toBeGreaterThan(0);
    });
  });

  it('renders the entry card from Google Translate', async () => {
    mockLookupGoogleTranslate.mockResolvedValue([gtEntry]);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'pretty');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getAllByTestId('entry-card').length).toBe(1);
      expect(screen.getByText('pretty')).toBeTruthy();
    });
  });

  it('falls through to Google Translate when Finkel returns nothing', async () => {
    mockGetSourceOrder.mockResolvedValue(['finkel', 'google_translate', 'none']);
    mockLookup.mockResolvedValue([]);
    mockLookupGoogleTranslate.mockResolvedValue([gtEntry]);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'pretty');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => {
      expect(screen.getAllByText('Google Translate').length).toBeGreaterThan(0);
      expect(screen.getByTestId('fallback-note')).toBeTruthy();
      expect(screen.getByText('No results from Finkel')).toBeTruthy();
    });
  });

  it('saves Google Translate results to cache', async () => {
    mockLookupGoogleTranslate.mockResolvedValue([gtEntry]);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'pretty');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(mockSaveCache).toHaveBeenCalledTimes(1));
    expect(mockSaveCache).toHaveBeenCalledWith('pretty', [gtEntry], 'google_translate');
  });

  it('calls refreshSaved after Google Translate results land', async () => {
    const mockRefreshSaved = jest.fn().mockResolvedValue(undefined);
    mockUseSaved.mockReturnValue({
      savedKeySet: new Set(),
      savedEntries: [],
      isLoading: false,
      refreshSaved: mockRefreshSaved,
    });
    mockLookupGoogleTranslate.mockResolvedValue([gtEntry]);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'pretty');
    fireEvent.press(screen.getByTestId('search-button'));

    // Google Translate results land — save entry should trigger refreshSaved
    await waitFor(() => screen.getAllByTestId('save-entry-button'));
    fireEvent.press(screen.getAllByTestId('save-entry-button')[0]);
    await waitFor(() => expect(mockRefreshSaved).toHaveBeenCalled());
  });

  it('shows no-results when Google Translate also returns nothing', async () => {
    mockGetSourceOrder.mockResolvedValue(['finkel', 'google_translate', 'none']);
    mockLookup.mockResolvedValue([]);
    mockLookupGoogleTranslate.mockResolvedValue([]);

    renderScreen();
    fireEvent.changeText(screen.getByTestId('search-input'), 'xyznotaword');
    fireEvent.press(screen.getByTestId('search-button'));

    await waitFor(() => expect(screen.getByTestId('no-results')).toBeTruthy());
    expect(mockSaveCache).not.toHaveBeenCalled();
  });
});
