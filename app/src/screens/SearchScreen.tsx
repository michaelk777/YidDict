import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { lookupFinkel, FinkelEntry } from '../services/finkelService';
import { getCachedEntries, saveToCache, logSearchHistory } from '../db/cacheDb';
import { detectInputScript } from '../utils/inputDetector';

export default function SearchScreen() {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<FinkelEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setFromCache(false);
    setHasSearched(true);

    try {
      const script = detectInputScript(trimmed);
      const isHebrew = script === 'hebrew';
      console.log(`[YidDict] SearchScreen: search initiated query="${trimmed}" script=${script}`);

      const cached = await getCachedEntries(trimmed, 'finkel');
      if (cached) {
        console.log('[YidDict] SearchScreen: serving results from cache');
        setEntries(cached);
        setFromCache(true);
        await logSearchHistory(trimmed, script, 'finkel');
        return;
      }

      const results = await lookupFinkel(trimmed, isHebrew);
      console.log(`[YidDict] SearchScreen: live lookup returned ${results.length} result(s)`);
      setEntries(results);

      if (results.length > 0) {
        await saveToCache(trimmed, results, 'finkel');
      }
      await logSearchHistory(trimmed, script, 'finkel');
    } catch (err) {
      setError('Could not reach the dictionary. Check your connection and try again.');
      console.error('[YidDict] SearchScreen lookup error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const handleClear = useCallback(() => {
    setQuery('');
    setEntries([]);
    setError(null);
    setFromCache(false);
    setHasSearched(false);
  }, []);

  const s = makeStyles(theme);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[s.root, { backgroundColor: theme.background }]} testID="search-root">
      {/* Search bar */}
      <View style={s.searchRow}>
        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          placeholder="Search Yiddish or English…"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
          testID="search-input"
        />
        {query.length > 0 ? (
          <TouchableOpacity
            style={s.clearBtn}
            onPress={handleClear}
            accessibilityLabel="Clear search"
            testID="clear-button"
          >
            <Text style={[s.clearBtnText, { color: theme.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[s.searchBtn, { backgroundColor: theme.primary }]}
          onPress={handleSearch}
          accessibilityLabel="Search"
          testID="search-button"
        >
          <Text style={s.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Status badges */}
      {hasSearched && !isLoading ? (
        <View style={s.badgeRow}>
          <View style={[s.badge, s.badgeFinkel]}>
            <Text style={s.badgeText}>Finkel</Text>
          </View>
          {fromCache ? (
            <View style={[s.badge, s.badgeCached]}>
              <Text style={s.badgeText}>cached</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Loading */}
      {isLoading ? (
        <ActivityIndicator
          style={s.spinner}
          color={theme.primary}
          testID="loading-indicator"
        />
      ) : null}

      {/* Error */}
      {error ? (
        <Text style={[s.errorText, { color: theme.text }]} testID="error-message">
          {error}
        </Text>
      ) : null}

      {/* Results */}
      {!isLoading && !error ? (
        <FlatList
          data={entries}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <EntryRow entry={item} theme={theme} />}
          contentContainerStyle={s.listContent}
          ListEmptyComponent={
            hasSearched ? (
              <View testID="no-results">
                <Text style={[s.emptyText, { color: theme.textSecondary }]}>
                  No results in Finkel's dictionary.
                </Text>
                <Text style={[s.emptyHint, { color: theme.textSecondary }]}>
                  Verterbukh lookup coming in the next update.
                </Text>
              </View>
            ) : null
          }
        />
      ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Entry row component
// ---------------------------------------------------------------------------

interface EntryRowProps {
  entry: FinkelEntry;
  theme: ReturnType<typeof useTheme>['theme'];
}

function EntryRow({ entry, theme }: EntryRowProps) {
  const s = makeStyles(theme);
  return (
    <View
      style={[
        s.entryCard,
        entry.isPhrase
          ? [s.phraseCard, { borderLeftColor: theme.primary, backgroundColor: theme.background }]
          : { borderColor: theme.border, backgroundColor: theme.surface },
      ]}
      testID="entry-card"
    >
      {/* Yiddish headword row: YIVO (LTR) + Hebrew script (RTL) */}
      <View style={s.headwordRow}>
        {entry.yiddishRomanized ? (
          <Text style={[s.romanized, { color: theme.text }]}>
            {entry.yiddishRomanized}
          </Text>
        ) : null}
        {entry.yiddishHebrew ? (
          <Text style={[s.hebrew, { color: theme.text }]}>
            {entry.yiddishHebrew}
          </Text>
        ) : null}
      </View>

      {/* Part of speech */}
      {entry.partOfSpeech ? (
        <Text style={[s.grammar, { color: theme.textSecondary }]}>
          {entry.partOfSpeech}
          {entry.conjugationInfo ? `  ${entry.conjugationInfo}` : ''}
        </Text>
      ) : null}

      {/* English definition */}
      {entry.english ? (
        <Text style={[s.definition, { color: theme.text }]}>
          {entry.english}
        </Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function makeStyles(theme: ReturnType<typeof useTheme>['theme']) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 8,
    },
    input: {
      flex: 1,
      height: 44,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      fontSize: 16,
      color: theme.text,
      backgroundColor: theme.surface,
    },
    clearBtn: {
      padding: 6,
    },
    clearBtnText: {
      fontSize: 16,
    },
    searchBtn: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    searchBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
    badgeRow: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 12,
      paddingBottom: 6,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
    },
    badgeFinkel: {
      backgroundColor: '#2563EB',
    },
    badgeCached: {
      backgroundColor: '#6B7280',
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
    },
    spinner: {
      marginTop: 32,
    },
    errorText: {
      marginHorizontal: 16,
      marginTop: 24,
      fontSize: 15,
      textAlign: 'center',
    },
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: 24,
    },
    emptyText: {
      marginTop: 40,
      textAlign: 'center',
      fontSize: 15,
    },
    emptyHint: {
      marginTop: 8,
      textAlign: 'center',
      fontSize: 13,
    },
    entryCard: {
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    phraseCard: {
      marginLeft: 20,
      marginBottom: 4,
      borderTopWidth: 0,
      borderRightWidth: 0,
      borderBottomWidth: 0,
      borderLeftWidth: 3,
      borderRadius: 0,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
      paddingVertical: 8,
    },
    headwordRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 4,
    },
    romanized: {
      fontSize: 17,
      fontWeight: '600',
    },
    hebrew: {
      fontSize: 18,
      writingDirection: 'rtl',
      textAlign: 'right',
    },
    grammar: {
      fontSize: 13,
      fontStyle: 'italic',
      marginBottom: 4,
    },
    definition: {
      fontSize: 15,
    },
  });
}
