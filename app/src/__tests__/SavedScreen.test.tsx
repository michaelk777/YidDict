import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../context/ThemeContext';
import { SavedProvider } from '../context/SavedContext';
import SavedScreen from '../screens/SavedScreen';
import { SavedEntry } from '../db/savedDb';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  default: () => 'light',
}));

jest.mock('expo-file-system/legacy');
jest.mock('expo-sharing');

jest.mock('../db/savedDb', () => ({
  getSavedEntries: jest.fn(),
  deleteEntry: jest.fn().mockResolvedValue(undefined),
  clearSaved: jest.fn().mockResolvedValue(undefined),
  generateCsv: jest.fn().mockReturnValue('csv-content'),
  generateTsv: jest.fn().mockReturnValue('tsv-content'),
}));

import { getSavedEntries, deleteEntry, clearSaved } from '../db/savedDb';

const mockGetSavedEntries = getSavedEntries as jest.Mock;
const mockDeleteEntry = deleteEntry as jest.Mock;
const mockClearSaved = clearSaved as jest.Mock;

const sampleEntries: SavedEntry[] = [
  {
    id: 1,
    query: 'sheyn',
    yiddishHebrew: 'שיין',
    yiddishRomanized: 'sheyn',
    english: 'pretty',
    partOfSpeech: 'adjective',
    grammaticalInfo: null,
    source: 'finkel',
    savedAt: 2000000,
    isPhrase: false,
  },
  {
    id: 2,
    query: 'gut',
    yiddishHebrew: 'גוט',
    yiddishRomanized: 'gut',
    english: 'good',
    partOfSpeech: 'adjective',
    grammaticalInfo: null,
    source: 'verterbukh',
    savedAt: 1000000,
    isPhrase: false,
  },
];

function renderScreen() {
  return render(
    <ThemeProvider>
      <SavedProvider>
        <SavedScreen />
      </SavedProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSavedEntries.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('SavedScreen — loading', () => {
  it('shows a loading indicator while fetching', async () => {
    mockGetSavedEntries.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(await screen.findByTestId('loading-indicator')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('SavedScreen — empty state', () => {
  it('shows the empty state when there are no saved entries', async () => {
    mockGetSavedEntries.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByTestId('empty-state')).toBeTruthy();
  });

  it('does not show entry rows when there are no saved entries', async () => {
    mockGetSavedEntries.mockResolvedValue([]);
    renderScreen();
    await screen.findByTestId('empty-state');
    expect(screen.queryByTestId('saved-entry-row')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Entries list
// ---------------------------------------------------------------------------

describe('SavedScreen — entries', () => {
  beforeEach(() => {
    mockGetSavedEntries.mockResolvedValue(sampleEntries);
  });

  it('renders a row for each saved entry', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('saved-entry-row').length).toBe(2);
    });
  });

  it('shows the YIVO romanization', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('sheyn')).toBeTruthy());
  });

  it('shows the English definition', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('pretty')).toBeTruthy());
  });

  it('shows the entry count in the header', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('2 saved')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe('SavedScreen — delete', () => {
  beforeEach(() => {
    mockGetSavedEntries.mockResolvedValue(sampleEntries);
  });

  it('renders a delete button on each row', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByTestId('delete-entry-button').length).toBe(2);
    });
  });

  it('calls deleteEntry with the correct id when delete is pressed', async () => {
    renderScreen();
    await waitFor(() => screen.getAllByTestId('delete-entry-button'));
    fireEvent.press(screen.getAllByTestId('delete-entry-button')[0]);
    expect(mockDeleteEntry).toHaveBeenCalledWith(1);
  });

  it('removes the deleted row from the list', async () => {
    // initial load: both entries; refresh after delete: one entry
    mockGetSavedEntries
      .mockResolvedValueOnce(sampleEntries)
      .mockResolvedValueOnce([sampleEntries[1]]);
    renderScreen();
    await waitFor(() => screen.getAllByTestId('delete-entry-button'));
    fireEvent.press(screen.getAllByTestId('delete-entry-button')[0]);
    await waitFor(() => {
      expect(screen.getAllByTestId('saved-entry-row').length).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Clear all
// ---------------------------------------------------------------------------

describe('SavedScreen — clear all', () => {
  beforeEach(() => {
    mockGetSavedEntries.mockResolvedValue(sampleEntries);
  });

  it('renders the clear-all button', async () => {
    renderScreen();
    expect(await screen.findByTestId('clear-all-button')).toBeTruthy();
  });

  it('calls clearSaved and empties the list when confirmed', async () => {
    // initial load: both entries; refresh after clear: empty
    mockGetSavedEntries
      .mockResolvedValueOnce(sampleEntries)
      .mockResolvedValueOnce([]);

    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert')
      .mockImplementation((_title, _msg, buttons) => {
        const destructive = (buttons as { text: string; onPress?: () => void }[])
          .find(b => b.text === 'Clear All');
        destructive?.onPress?.();
      });

    renderScreen();
    await waitFor(() => screen.getAllByTestId('saved-entry-row'));
    fireEvent.press(screen.getByTestId('clear-all-button'));

    expect(mockClearSaved).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('saved-entry-row')).toBeNull());

    alertSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

describe('SavedScreen — export', () => {
  it('renders the export button', async () => {
    mockGetSavedEntries.mockResolvedValue(sampleEntries);
    renderScreen();
    expect(await screen.findByTestId('export-button')).toBeTruthy();
  });

  it('shows an alert when export is pressed with no saved entries', async () => {
    const mockAlert = jest.fn();
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(mockAlert);

    mockGetSavedEntries.mockResolvedValue([]);
    renderScreen();
    await screen.findByTestId('export-button');
    fireEvent.press(screen.getByTestId('export-button'));

    expect(mockAlert).toHaveBeenCalledWith('Nothing to Export', expect.any(String));
    jest.restoreAllMocks();
  });

  it('shows a format picker when export is pressed with entries', async () => {
    const mockAlert = jest.fn();
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(mockAlert);

    mockGetSavedEntries.mockResolvedValue(sampleEntries);
    renderScreen();
    await waitFor(() => screen.getAllByTestId('saved-entry-row'));
    fireEvent.press(screen.getByTestId('export-button'));

    expect(mockAlert).toHaveBeenCalledWith(
      'Export Format',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'CSV' }),
        expect.objectContaining({ text: 'TSV' }),
      ])
    );
    jest.restoreAllMocks();
  });
});
