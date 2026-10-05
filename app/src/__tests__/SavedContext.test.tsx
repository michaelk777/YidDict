import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SavedProvider, useSaved } from '../context/SavedContext';
import { getSavedEntries } from '../db/savedDb';

jest.mock('../db/savedDb', () => ({
  getSavedEntries: jest.fn(),
}));

const mockGetSavedEntries = getSavedEntries as jest.Mock;

function Consumer() {
  const { isLoading, savedEntries, refreshSaved } = useSaved();
  return (
    <>
      <Text testID="isLoading">{String(isLoading)}</Text>
      <Text testID="count">{savedEntries.length}</Text>
      <TouchableOpacity testID="refresh" onPress={() => refreshSaved()} />
    </>
  );
}

function renderWithSaved() {
  return render(
    <SavedProvider>
      <Consumer />
    </SavedProvider>
  );
}

describe('SavedContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows isLoading=true during the initial load, then false once resolved', async () => {
    mockGetSavedEntries.mockResolvedValue([]);
    renderWithSaved();
    expect(screen.getByTestId('isLoading').props.children).toBe('true');
    await waitFor(() => expect(screen.getByTestId('isLoading').props.children).toBe('false'));
  });

  // Verifies isLoading only reflects the very first load, not every
  // subsequent refreshSaved() call (e.g. triggered by a save/unsave on the
  // Search tab while the Saved tab sits mounted in the background).
  it('does not flip isLoading back to true on a later refreshSaved() call', async () => {
    mockGetSavedEntries.mockResolvedValue([]);
    renderWithSaved();
    await waitFor(() => expect(screen.getByTestId('isLoading').props.children).toBe('false'));

    let resolveSecondCall: (entries: unknown[]) => void = () => {};
    mockGetSavedEntries.mockReturnValueOnce(
      new Promise(resolve => { resolveSecondCall = resolve; })
    );

    fireEvent.press(screen.getByTestId('refresh'));
    // The second call is still pending, but isLoading must never have
    // flipped true for it — the whole point of the fix.
    expect(screen.getByTestId('isLoading').props.children).toBe('false');

    resolveSecondCall([]);
    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe(0));
    expect(screen.getByTestId('isLoading').props.children).toBe('false');
  });

  it('still updates savedEntries/savedKeySet from a later refreshSaved() call', async () => {
    mockGetSavedEntries.mockResolvedValueOnce([]);
    renderWithSaved();
    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe(0));

    mockGetSavedEntries.mockResolvedValueOnce([
      { id: 1, query: 'sheyn', yiddishHebrew: 'שיין', yiddishTransliterated: 'sheyn', english: 'pretty',
        partOfSpeech: null, grammaticalInfo: null, source: 'finkel', savedAt: 1, isPhrase: false,
        hebrewIsGenerated: false, transliteratedIsGenerated: false, hebrewIsPartial: false },
    ]);
    fireEvent.press(screen.getByTestId('refresh'));
    await waitFor(() => expect(screen.getByTestId('count').props.children).toBe(1));
  });
});
